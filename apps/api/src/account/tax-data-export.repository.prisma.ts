import { Inject, Injectable, Optional } from '@nestjs/common'
import { PersonSealService } from '../household-core/person-seal.service.js'
import { Prisma } from '@prisma/client'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { ExportTaxDataEntry, ExportTaxDataValue } from './export/export-document.js'
import type { ExportReceiptFileMeta, TaxDataExportRepository } from './tax-data-export.repository.js'
import { delegateName, entriesWhere, PERSONAL_DATA_REGISTRY, type ExportSection } from '../personal-data/personal-data-registry.js'
import { isShadowId, personIds } from '../common/shadow-id.js'

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

/** What a section reads with: the client, the person's id set (own id and Person B shadow ids), the seal. */
interface SectionRead {
  readonly db: EncryptedPrismaClient
  readonly seal: PersonSealService | undefined
  readonly userId: string
  readonly ids: string[]
}

type SectionPart =
  /** Built by the export service as a part of the document of its own (`account`, `accessLog`, `receiptFiles`). */
  | { readonly part: 'document' }
  /** Read here into `taxData` or `accountData`. */
  | { readonly part: 'taxData' | 'accountData'; read(context: SectionRead): Promise<ExportTaxDataEntry[]> }

/** The registry models a section shows; the registry lock compares them with the entries naming the section. */
type SectionSpec = SectionPart & { readonly models: readonly string[] }

const accountEntry = (area: string, row: Record<string, unknown>): ExportTaxDataEntry => ({
  area,
  taxYear: null,
  fields: Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : ((Array.isArray(value) ? value.join(' ') : value) as ExportTaxDataValue)]),
  ),
})

/**
 * ADR-0062: household people are sealed under their own key — the export shows them readable. Also the
 * person's own facts as a partner's household keeps them (`linkedUserId`, API-23).
 */
async function householdSection({ db, seal, userId }: SectionRead): Promise<ExportTaxDataEntry[]> {
  const [own, copies, mergeQuestions] = await Promise.all([
    db.householdPerson.findMany({ where: { householdUserId: userId }, include: { memberships: true } }),
    db.householdPerson.findMany({ where: { linkedUserId: userId, NOT: { householdUserId: userId } }, include: { memberships: true } }),
    db.householdMergeCandidate.findMany({ where: { householdUserId: userId } }),
  ])
  const readable = async ({ sealed, memberships, ...row }: (typeof own)[number]) => {
    const facts = seal ? await seal.unseal(row.id, sealed) : null
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
    ...mergeQuestions.map((row) => toExportEntry('Haushalt (Rückfrage „dieselben?“)', 'HouseholdMergeCandidate', row as Row)),
  ]
}

/**
 * Every section the registry names, with what it shows. A section the registry names without an entry here
 * does not compile; the account data never carries a secret that would be a way in (API-17).
 */
export const EXPORT_SECTIONS: { readonly [S in ExportSection]: SectionSpec } = {
  identity: { models: ['User', 'Account'], part: 'document' },
  accessLog: { models: ['TaxDataAccessLog'], part: 'document' },
  receiptFiles: { models: ['ReceiptFile'], part: 'document' },
  coupling: {
    models: ['TaxYearLink', 'PartnerLink'],
    part: 'taxData',
    read: async ({ db, userId }) => {
      const either = { OR: [{ personAUserId: userId }, { personBUserId: userId }] }
      const [links, partnerLinks] = await Promise.all([db.taxYearLink.findMany({ where: either }), db.partnerLink.findMany({ where: either })])
      return [
        ...links.map((row) => toExportEntry('Steuerjahr-Kopplung', 'TaxYearLink', row as Row)),
        ...partnerLinks.map((row) => toExportEntry('Partner-Verknüpfung', 'PartnerLink', row as Row)),
      ]
    },
  },
  household: { models: ['HouseholdPerson', 'TaxYearMembership', 'HouseholdMergeCandidate'], part: 'taxData', read: householdSection },
  security: {
    models: ['TwoFactor', 'Passkey'],
    part: 'accountData',
    read: async ({ db, userId, ids }) => {
      const [user, twoFactors, passkeys] = await Promise.all([
        db.user.findUnique({ where: { id: userId }, select: { twoFactorEnabled: true } }),
        db.twoFactor.count({ where: { userId: { in: ids } } }),
        db.passkey.findMany({ where: { userId: { in: ids } }, select: { name: true, deviceType: true, backedUp: true, aaguid: true, createdAt: true } }),
      ])
      return [accountEntry('Zwei-Faktor-Anmeldung', { aktiv: user?.twoFactorEnabled ?? false, eingerichtet: twoFactors > 0 }), ...passkeys.map((row) => accountEntry('Passkey', row))]
    },
  },
  sessions: {
    models: ['Session'],
    part: 'accountData',
    read: async ({ db, ids }) =>
      (await db.session.findMany({ where: { userId: { in: ids } }, select: { createdAt: true, updatedAt: true, expiresAt: true, ipAddress: true, userAgent: true } })).map((row) => accountEntry('Sitzung', row)),
  },
  devices: {
    models: ['DeviceCode'],
    part: 'accountData',
    read: async ({ db, ids }) =>
      (
        await db.deviceCode.findMany({
          where: { userId: { in: ids } },
          select: { status: true, clientId: true, scope: true, requestIp: true, requestUserAgent: true, requestRegion: true, requestedAt: true, expiresAt: true },
        })
      ).map((row) => accountEntry('Geräte-Anmeldung', row)),
  },
  assistants: {
    models: ['OauthClient', 'OauthConsent', 'OauthAccessToken', 'OauthRefreshToken'],
    part: 'accountData',
    read: async ({ db, ids }) => {
      const where = { userId: { in: ids } }
      const [clients, consents, accessTokens, refreshTokens] = await Promise.all([
        db.oauthClient.findMany({ where, select: { clientId: true, name: true, uri: true, createdAt: true } }),
        db.oauthConsent.findMany({ where, select: { clientId: true, scopes: true, createdAt: true, updatedAt: true, client: { select: { name: true } } } }),
        db.oauthAccessToken.findMany({ where, select: { clientId: true, scopes: true, createdAt: true, expiresAt: true, revoked: true } }),
        db.oauthRefreshToken.findMany({ where, select: { clientId: true, scopes: true, createdAt: true, expiresAt: true, revoked: true } }),
      ])
      return [
        ...clients.map((row) => accountEntry('Verbundener Assistent (selbst angelegt)', row)),
        ...consents.map(({ client, ...row }) => accountEntry('Zustimmung für Assistent', { ...row, name: client?.name ?? null })),
        ...accessTokens.map((row) => accountEntry('Zugang eines Assistenten (Access-Token)', row)),
        ...refreshTokens.map((row) => accountEntry('Zugang eines Assistenten (Refresh-Token)', row)),
      ]
    },
  },
  legalHolds: {
    models: ['LegalHold'],
    part: 'accountData',
    read: async ({ db, ids }) =>
      (await db.legalHold.findMany({ where: { userId: { in: ids } }, select: { resource: true, reason: true, holdUntil: true, createdAt: true } })).map((row) =>
        accountEntry('Gesetzliche Aufbewahrung (Sperre)', row),
      ),
  },
}

/** The sections of one part, each once, in the order the registry first names them. */
function sectionsOf(part: 'taxData' | 'accountData'): Extract<SectionSpec, { part: 'taxData' | 'accountData' }>[] {
  const names = [...new Set(PERSONAL_DATA_REGISTRY.flatMap((entry) => (entry.export.kind === 'section' ? [entry.export.section] : [])))]
  return names.map((name) => EXPORT_SECTIONS[name]).filter((spec): spec is Extract<SectionSpec, { part: 'taxData' | 'accountData' }> => spec.part === part)
}

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

  private async readSections(part: 'taxData' | 'accountData', userId: string): Promise<ExportTaxDataEntry[]> {
    const context: SectionRead = { db: this.prisma, seal: this.seal, userId, ids: personIds(userId) }
    return (await Promise.all(sectionsOf(part).map((section) => section.read(context)))).flat()
  }

  /** Every `rows` entry of the registry over the person's id set (own id and Person B shadow ids), and the tax-data sections. */
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
    const entries = [...rowsPerEntry.flat(), ...(await this.readSections('taxData', userId))]
    return entries.sort(
      (a, b) =>
        (a.taxYear ?? Number.MAX_SAFE_INTEGER) - (b.taxYear ?? Number.MAX_SAFE_INTEGER) ||
        a.area.localeCompare(b.area, 'de'),
    )
  }

  /** Sessions, second factor, passkeys, device logins, connected assistants and legal holds (API-17), over the person's id set. */
  findAccountDataForUser(userId: string): Promise<ExportTaxDataEntry[]> {
    return this.readSections('accountData', userId)
  }

  /** The stored receipt files' metadata over the person's id set, without bytes; the files are read one at a time (H2-6). */
  async listReceiptFiles(userId: string): Promise<ExportReceiptFileMeta[]> {
    const files = await this.prisma.receiptFile.findMany({
      where: { userId: { in: personIds(userId) } },
      select: { userId: true, receiptId: true, mimeType: true, byteLength: true, createdAt: true, receipt: { select: { fileName: true } } },
      orderBy: { createdAt: 'asc' },
    })
    return files.map(({ receipt, createdAt, userId: ownerId, ...file }) => ({ ...file, ownerId, fileName: receipt.fileName, uploadedAt: createdAt.toISOString(), contentBase64: null }))
  }
}
