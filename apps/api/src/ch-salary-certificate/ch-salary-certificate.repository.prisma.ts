import { Inject, Injectable } from '@nestjs/common'
import { SALARY_CERTIFICATE_AMOUNT_FIELDS, type SalaryCertificateAmountFieldId } from '@steuereule/core'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { ChSalaryCertificateFields, CrossBorderSalaryStatementRecord, CrossBorderSalaryStatementRepository, NGreDetails, ProvisionUpdate } from './ch-salary-certificate.repository.js'

const FIELD_COLUMN: Record<SalaryCertificateAmountFieldId, keyof ChSalaryCertificateRow> = {
  lohn: 'lohn',
  gehaltsnebenleistungen: 'gehaltsnebenleistungen',
  'unregelmaessige-leistungen': 'irregularBenefits',
  kapitalleistungen: 'kapitalleistungen',
  beteiligungsrechte: 'beteiligungsrechte',
  sitzungsgelder: 'sitzungsgelder',
  'andere-leistungen': 'otherBenefits',
  'bruttolohn-total': 'grossWageTotal',
  'ahv-beitraege': 'ahvContributions',
  'berufliche-vorsorge': 'occupationalPension',
  nettolohn: 'nettolohn',
  quellensteuer: 'quellensteuer',
  spesen: 'spesen',
  'weitere-nebenleistungen': 'otherFringeBenefits',
}

type ChSalaryCertificateRow = {
  userId: string
  taxYear: number
  lohn: string | null
  gehaltsnebenleistungen: string | null
  irregularBenefits: string | null
  kapitalleistungen: string | null
  beteiligungsrechte: string | null
  sitzungsgelder: string | null
  otherBenefits: string | null
  grossWageTotal: string | null
  ahvContributions: string | null
  occupationalPension: string | null
  nettolohn: string | null
  quellensteuer: string | null
  spesen: string | null
  otherFringeBenefits: string | null
  bemerkungen: string | null
  saeule3aChf: string | null
  krankenkasseChf: string | null
  exchangeRateMonth: string | null
  exchangeRateValue: number | null
  exchangeRateMode: string | null
  exchangeRateReceiptId: string | null
} & NGreDetails

function toRecord(row: ChSalaryCertificateRow): CrossBorderSalaryStatementRecord {
  const fields = {} as ChSalaryCertificateFields
  for (const field of SALARY_CERTIFICATE_AMOUNT_FIELDS) fields[field] = row[FIELD_COLUMN[field] as keyof ChSalaryCertificateRow] as string | null
  return {
    userId: row.userId,
    taxYear: row.taxYear,
    fields,
    bemerkungen: row.bemerkungen,
    saeule3aChf: row.saeule3aChf,
    krankenkasseChf: row.krankenkasseChf,
    exchangeRateMonth: row.exchangeRateMonth,
    exchangeRateValue: row.exchangeRateValue,
    exchangeRateMode: row.exchangeRateMode,
    exchangeRateReceiptId: row.exchangeRateReceiptId,
    nGre: {
      arbeitgeberName: row.arbeitgeberName,
      arbeitgeberStrasse: row.arbeitgeberStrasse,
      arbeitgeberPlzOrt: row.arbeitgeberPlzOrt,
      familienzulagenChf: row.familienzulagenChf,
      krankentaggeldChf: row.krankentaggeldChf,
      pkArbeitnehmerChf: row.pkArbeitnehmerChf,
      pkArbeitgeberChf: row.pkArbeitgeberChf,
      pkArbeitgeberGesamtChf: row.pkArbeitgeberGesamtChf,
      steuerfreiesKrankentaggeldChf: row.steuerfreiesKrankentaggeldChf,
      steuerfreiesUnfalltaggeldChf: row.steuerfreiesUnfalltaggeldChf ?? null,
      krankentaggeldArbeitgeberProzent: row.krankentaggeldArbeitgeberProzent,
      krankentaggeldArbeitgeberChf: row.krankentaggeldArbeitgeberChf,
      nbuvArbeitgeberProzent: row.nbuvArbeitgeberProzent,
      nbuvArbeitgeberChf: row.nbuvArbeitgeberChf,
      nGreSonderfaelle: row.nGreSonderfaelle,
      krankenkasseZusatzChf: row.krankenkasseZusatzChf ?? null,
      kvZuschussAnspruch: row.kvZuschussAnspruch ?? null,
      familienzulagenImBruttolohn: row.familienzulagenImBruttolohn ?? null,
    },
  }
}

function fieldData(field: SalaryCertificateAmountFieldId, value: string | null): Record<string, string | null> {
  return { [FIELD_COLUMN[field]]: value }
}

const EMPTY_CREATE: Record<string, null> = Object.fromEntries([
  ...SALARY_CERTIFICATE_AMOUNT_FIELDS.map((f) => [FIELD_COLUMN[f], null]),
  ['bemerkungen', null],
  ['saeule3aChf', null],
  ['krankenkasseChf', null],
  ['exchangeRateMonth', null],
  ['exchangeRateValue', null],
  ['exchangeRateMode', null],
  ['exchangeRateReceiptId', null],
  ['arbeitgeberName', null],
  ['arbeitgeberStrasse', null],
  ['arbeitgeberPlzOrt', null],
  ['familienzulagenChf', null],
  ['krankentaggeldChf', null],
  ['pkArbeitnehmerChf', null],
  ['pkArbeitgeberChf', null],
  ['pkArbeitgeberGesamtChf', null],
  ['steuerfreiesKrankentaggeldChf', null],
  ['steuerfreiesUnfalltaggeldChf', null],
  ['krankentaggeldArbeitgeberProzent', null],
  ['krankentaggeldArbeitgeberChf', null],
  ['nbuvArbeitgeberProzent', null],
  ['nbuvArbeitgeberChf', null],
  ['nGreSonderfaelle', null],
])

@Injectable()
export class PrismaChSalaryCertificateRepository implements CrossBorderSalaryStatementRepository {
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async findForUserAndYear(userId: string, taxYear: number): Promise<CrossBorderSalaryStatementRecord | null> {
    const row = await this.prisma.chSalaryCertificate.findUnique({ where: { userId_taxYear: { userId, taxYear } } })
    return row === null ? null : toRecord(row as ChSalaryCertificateRow)
  }

  async listForUsers(userIds: readonly string[]): Promise<readonly CrossBorderSalaryStatementRecord[]> {
    if (userIds.length === 0) return []
    const rows = await this.prisma.chSalaryCertificate.findMany({ where: { userId: { in: [...userIds] } }, orderBy: { taxYear: 'desc' } })
    return rows.map((row) => toRecord(row as ChSalaryCertificateRow))
  }

  async setField(userId: string, taxYear: number, field: SalaryCertificateAmountFieldId, value: string | null): Promise<CrossBorderSalaryStatementRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.chSalaryCertificate.upsert({
        where: { userId_taxYear: { userId, taxYear } },
        create: { userId, taxYear, ...EMPTY_CREATE, ...fieldData(field, value) },
        update: fieldData(field, value),
      }),
      this.prisma.taxDataAccessLog.create({ data: { userId, action: 'WRITE', resource: 'ch-lohnausweis' } }),
    ])
    return toRecord(row as ChSalaryCertificateRow)
  }

  async setRemarks(userId: string, taxYear: number, text: string | null): Promise<CrossBorderSalaryStatementRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.chSalaryCertificate.upsert({
        where: { userId_taxYear: { userId, taxYear } },
        create: { userId, taxYear, ...EMPTY_CREATE, bemerkungen: text },
        update: { bemerkungen: text },
      }),
      this.prisma.taxDataAccessLog.create({ data: { userId, action: 'WRITE', resource: 'ch-lohnausweis' } }),
    ])
    return toRecord(row as ChSalaryCertificateRow)
  }

  async setProvision(userId: string, taxYear: number, provision: ProvisionUpdate): Promise<CrossBorderSalaryStatementRecord> {
    // Only the columns the save carries: two saves that overlap (KVG and Säule 3a from the mask)
    // each set their own column in one UPDATE, so neither can put back a value it read earlier.
    const update = {
      ...(provision.saeule3aChf === undefined ? {} : { saeule3aChf: provision.saeule3aChf }),
      ...(provision.krankenkasseChf === undefined ? {} : { krankenkasseChf: provision.krankenkasseChf }),
    }
    const [row] = await this.prisma.$transaction([
      this.prisma.chSalaryCertificate.upsert({
        where: { userId_taxYear: { userId, taxYear } },
        create: { userId, taxYear, ...EMPTY_CREATE, ...update },
        update,
      }),
      this.prisma.taxDataAccessLog.create({ data: { userId, action: 'WRITE', resource: 'ch-lohnausweis' } }),
    ])
    return toRecord(row as ChSalaryCertificateRow)
  }

  async setNGre(userId: string, taxYear: number, details: Partial<NGreDetails>): Promise<CrossBorderSalaryStatementRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.chSalaryCertificate.upsert({
        where: { userId_taxYear: { userId, taxYear } },
        create: { userId, taxYear, ...EMPTY_CREATE, ...details },
        update: details,
      }),
      this.prisma.taxDataAccessLog.create({ data: { userId, action: 'WRITE', resource: 'ch-lohnausweis' } }),
    ])
    return toRecord(row as ChSalaryCertificateRow)
  }

  async setExchangeRate(
    userId: string,
    taxYear: number,
    exchangeRate: { month: string | null; rate: number | null; mode: string | null; receiptId?: string },
  ): Promise<CrossBorderSalaryStatementRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.chSalaryCertificate.upsert({
        where: { userId_taxYear: { userId, taxYear } },
        create: {
          userId,
          taxYear,
          ...EMPTY_CREATE,
          exchangeRateMonth: exchangeRate.month,
          exchangeRateValue: exchangeRate.rate,
          exchangeRateMode: exchangeRate.mode,
          exchangeRateReceiptId: exchangeRate.receiptId ?? null,
        },
        update: {
          exchangeRateMonth: exchangeRate.month,
          exchangeRateValue: exchangeRate.rate,
          exchangeRateMode: exchangeRate.mode,
          exchangeRateReceiptId: exchangeRate.receiptId ?? null,
        },
      }),
      this.prisma.taxDataAccessLog.create({ data: { userId, action: 'WRITE', resource: 'ch-lohnausweis' } }),
    ])
    return toRecord(row as ChSalaryCertificateRow)
  }
}
