import { Inject, Injectable, Optional } from '@nestjs/common'
import { PersonSealService } from '../household-core/person-seal.service.js'
import { Prisma } from '@prisma/client'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { ExportTaxDataEntry, ExportTaxDataValue } from './export/export-document.js'
import type { ExportReceiptFileMeta, TaxDataExportRepository } from './tax-data-export.repository.js'
import { delegateName, entriesWhere, isShadowId, personIds } from './personal-data-registry.js'

const OMITTED_FIELDS = new Set([
  'id',
  'userId',
  'personAUserId',
  'personBUserId',
  'taxYear',
  'receiptId',
  'iv',
  'authTag',
  'cipherBytes',
  'keyVersion',
  // Secrets of a login are never exported (a way in, not data about the person).
  'token',
  'password',
  'accessToken',
  'refreshToken',
  'idToken',
  'secret',
  'backupCodes',
  'publicKey',
  'clientSecret',
  'deviceCode',
  'userCode',
  'rotationReplayResponse',
  'confirmation',
])

/**
 * The export names every figure by its database column. The columns keep their German names through
 * `@map`, so the file a person downloads (Art. 15/20 DSGVO) does not change when the code's names do.
 */
const COLUMNS: ReadonlyMap<string, ReadonlyMap<string, string>> = new Map(
  Prisma.dmmf.datamodel.models.map((model) => [model.name, new Map(model.fields.map((field) => [field.name, field.dbName ?? field.name]))]),
)

type Row = Record<string, unknown> & { taxYear?: number | null }

export function toExportEntry(area: string, model: Prisma.ModelName, row: Row): ExportTaxDataEntry {
  const columns = COLUMNS.get(model)
  const fields: Record<string, ExportTaxDataValue> = {}
  for (const [key, value] of Object.entries(row)) {
    if (OMITTED_FIELDS.has(key) || value instanceof Uint8Array) continue
    fields[columns?.get(key) ?? key] = value instanceof Date ? value.toISOString() : (value as ExportTaxDataValue)
  }
  return { area, taxYear: row.taxYear ?? null, fields }
}

type FindMany = (args: { where: Record<string, unknown>; orderBy?: unknown }) => Promise<Row[]>

/** The area of a row kept for Person B (a shadow id, ADR-0054): the same area, marked. */
const areaOf = (area: string, row: Row): string => (typeof row.userId === 'string' && isShadowId(row.userId) ? `${area} (Person B)` : area)

@Injectable()
export class PrismaTaxDataExportRepository implements TaxDataExportRepository {
  constructor(
    @Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient,
    @Optional() @Inject(PersonSealService) private readonly seal?: PersonSealService,
  ) {}

  private table(model: string): FindMany {
    const delegate = (this.prisma as unknown as Record<string, { findMany: FindMany }>)[delegateName(model)]!
    return (args) => delegate.findMany(args)
  }

  /** Every `rows` entry of the registry over the person's id set (own id and Person B shadow ids). */
  async findAllForUser(userId: string): Promise<ExportTaxDataEntry[]> {
    const ids = personIds(userId)
    const generic = entriesWhere((entry) => entry.export.kind === 'rows')
    const rowsPerEntry = await Promise.all(
      generic.map(async (entry) => {
        const exported = entry.export as { area: string; shadowOnly?: boolean }
        const where = { userId: { in: exported.shadowOnly ? ids.filter(isShadowId) : ids } }
        const found = await this.table(entry.model)({ where })
        return found.map((row) => toExportEntry(areaOf(exported.area, row), entry.model as Prisma.ModelName, row))
      }),
    )
    const entries = [...rowsPerEntry.flat(), ...(await this.coupling(userId)), ...(await this.household(userId))]
    return entries.sort(
      (a, b) =>
        (a.taxYear ?? Number.MAX_SAFE_INTEGER) - (b.taxYear ?? Number.MAX_SAFE_INTEGER) ||
        a.area.localeCompare(b.area, 'de'),
    )
  }

  private async coupling(userId: string): Promise<ExportTaxDataEntry[]> {
    const either = { OR: [{ personAUserId: userId }, { personBUserId: userId }] }
    const [links, partnerLinks] = await Promise.all([
      this.table('TaxYearLink')({ where: either }),
      this.table('PartnerLink')({ where: either }),
    ])
    return [
      ...links.map((row) => toExportEntry('Steuerjahr-Kopplung', 'TaxYearLink', row)),
      ...partnerLinks.map((row) => toExportEntry('Partner-Verknüpfung', 'PartnerLink', row)),
    ]
  }

  /**
   * ADR-0062: household people are sealed under their own key — the export shows them readable. Also the
   * person's own facts as a partner's household keeps them (`linkedUserId`, API-23).
   */
  private async household(userId: string): Promise<ExportTaxDataEntry[]> {
    const [own, copies, mergeQuestions] = await Promise.all([
      this.prisma.householdPerson.findMany({ where: { householdUserId: userId }, include: { memberships: true } }),
      this.prisma.householdPerson.findMany({ where: { linkedUserId: userId, NOT: { householdUserId: userId } }, include: { memberships: true } }),
      this.table('HouseholdMergeCandidate')({ where: { householdUserId: userId } }),
    ])
    const readable = async ({ sealed, memberships, ...row }: (typeof own)[number]) => {
      const facts = this.seal ? await this.seal.unseal(row.id, sealed) : null
      return {
        ...row,
        firstName: facts?.firstName ?? null,
        lastName: facts?.lastName ?? null,
        birthDate: facts?.birthDate ?? null,
        taxId: facts?.taxId ?? null,
        diedOn: facts?.diedOn ?? null,
        years: memberships.map((m) => m.taxYear).sort().join(', '),
      }
    }
    const omitHousehold = ({ householdUserId: _household, ...row }: Row) => row
    return [
      ...(await Promise.all(own.map(readable))).map((row) => toExportEntry('Haushalt (Person)', 'HouseholdPerson', row)),
      ...(await Promise.all(copies.map(readable))).map((row) => toExportEntry('Haushalt deiner Partnerin / deines Partners (Angaben über dich)', 'HouseholdPerson', omitHousehold(row))),
      ...mergeQuestions.map((row) => toExportEntry('Haushalt (Rückfrage „dieselben?“)', 'HouseholdMergeCandidate', row)),
    ]
  }

  /**
   * Sessions, second factor, passkeys, device logins, connected assistants and legal holds (API-17): what the
   * account itself stores about the person, without any secret that would be a way in.
   */
  async findAccountDataForUser(userId: string): Promise<ExportTaxDataEntry[]> {
    const where = { userId }
    const [user, sessions, twoFactors, passkeys, deviceCodes, clients, consents, accessTokens, refreshTokens, holds] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { twoFactorEnabled: true } }),
      this.prisma.session.findMany({ where, select: { createdAt: true, updatedAt: true, expiresAt: true, ipAddress: true, userAgent: true } }),
      this.prisma.twoFactor.count({ where }),
      this.prisma.passkey.findMany({ where, select: { name: true, deviceType: true, backedUp: true, aaguid: true, createdAt: true } }),
      this.prisma.deviceCode.findMany({ where, select: { status: true, clientId: true, scope: true, requestIp: true, requestUserAgent: true, requestRegion: true, requestedAt: true, expiresAt: true } }),
      this.prisma.oauthClient.findMany({ where, select: { clientId: true, name: true, uri: true, createdAt: true } }),
      this.prisma.oauthConsent.findMany({ where, select: { clientId: true, scopes: true, createdAt: true, updatedAt: true, client: { select: { name: true } } } }),
      this.prisma.oauthAccessToken.findMany({ where, select: { clientId: true, scopes: true, createdAt: true, expiresAt: true, revoked: true } }),
      this.prisma.oauthRefreshToken.findMany({ where, select: { clientId: true, scopes: true, createdAt: true, expiresAt: true, revoked: true } }),
      this.prisma.legalHold.findMany({ where, select: { resource: true, reason: true, holdUntil: true, createdAt: true } }),
    ])
    const list = (value: unknown) => (Array.isArray(value) ? value.join(' ') : value)
    const entry = (area: string, row: Record<string, unknown>): ExportTaxDataEntry => ({
      area,
      taxYear: null,
      fields: Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : (list(value) as ExportTaxDataValue)])),
    })
    return [
      entry('Zwei-Faktor-Anmeldung', { aktiv: user?.twoFactorEnabled ?? false, eingerichtet: twoFactors > 0 }),
      ...sessions.map((row) => entry('Sitzung', row)),
      ...passkeys.map((row) => entry('Passkey', row)),
      ...deviceCodes.map((row) => entry('Geräte-Anmeldung', row)),
      ...clients.map((row) => entry('Verbundener Assistent (selbst angelegt)', row)),
      ...consents.map(({ client, ...row }) => entry('Zustimmung für Assistent', { ...row, name: client?.name ?? null })),
      ...accessTokens.map((row) => entry('Zugang eines Assistenten (Access-Token)', row)),
      ...refreshTokens.map((row) => entry('Zugang eines Assistenten (Refresh-Token)', row)),
      ...holds.map((row) => entry('Gesetzliche Aufbewahrung (Sperre)', row)),
    ]
  }

  /** The stored receipt files' metadata, without bytes; the files are read one at a time (H2-6). */
  async listReceiptFiles(userId: string): Promise<ExportReceiptFileMeta[]> {
    const files = await this.prisma.receiptFile.findMany({
      where: { userId },
      select: { receiptId: true, mimeType: true, byteLength: true, createdAt: true, receipt: { select: { fileName: true } } },
      orderBy: { createdAt: 'asc' },
    })
    return files.map(({ receipt, createdAt, ...file }) => ({ ...file, fileName: receipt.fileName, uploadedAt: createdAt.toISOString(), contentBase64: null }))
  }
}
