import { Inject, Injectable } from '@nestjs/common'
import { SALARY_CERTIFICATE_AMOUNT_FIELDS, type SalaryCertificateAmountFieldId } from '@steuereule/core'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { ChSalaryCertificateFields, CrossBorderSalaryStatementRecord, CrossBorderSalaryStatementRepository, NGreDetails } from './ch-lohnausweis.repository.js'

const FIELD_COLUMN: Record<SalaryCertificateAmountFieldId, string> = {
  lohn: 'lohn',
  gehaltsnebenleistungen: 'gehaltsnebenleistungen',
  'unregelmaessige-leistungen': 'unregelmaessigeLeistungen',
  kapitalleistungen: 'kapitalleistungen',
  beteiligungsrechte: 'beteiligungsrechte',
  sitzungsgelder: 'sitzungsgelder',
  'andere-leistungen': 'andereLeistungen',
  'bruttolohn-total': 'bruttolohnTotal',
  'ahv-beitraege': 'ahvBeitraege',
  'berufliche-vorsorge': 'beruflicheVorsorge',
  nettolohn: 'nettolohn',
  quellensteuer: 'quellensteuer',
  spesen: 'spesen',
  'weitere-nebenleistungen': 'weitereNebenleistungen',
}

type ChSalaryCertificateRow = {
  userId: string
  steuerjahr: number
  lohn: string | null
  gehaltsnebenleistungen: string | null
  unregelmaessigeLeistungen: string | null
  kapitalleistungen: string | null
  beteiligungsrechte: string | null
  sitzungsgelder: string | null
  andereLeistungen: string | null
  bruttolohnTotal: string | null
  ahvBeitraege: string | null
  beruflicheVorsorge: string | null
  nettolohn: string | null
  quellensteuer: string | null
  spesen: string | null
  weitereNebenleistungen: string | null
  bemerkungen: string | null
  saeule3aChf: string | null
  krankenkasseChf: string | null
  wechselkursMonat: string | null
  wechselkursKurs: number | null
  wechselkursModus: string | null
  wechselkursBelegId: string | null
} & NGreDetails

function toRecord(row: ChSalaryCertificateRow): CrossBorderSalaryStatementRecord {
  const fields = {} as ChSalaryCertificateFields
  for (const field of SALARY_CERTIFICATE_AMOUNT_FIELDS) fields[field] = row[FIELD_COLUMN[field] as keyof ChSalaryCertificateRow] as string | null
  return {
    userId: row.userId,
    steuerjahr: row.steuerjahr,
    fields,
    bemerkungen: row.bemerkungen,
    saeule3aChf: row.saeule3aChf,
    krankenkasseChf: row.krankenkasseChf,
    wechselkursMonat: row.wechselkursMonat,
    wechselkursKurs: row.wechselkursKurs,
    wechselkursModus: row.wechselkursModus,
    wechselkursBelegId: row.wechselkursBelegId,
    nGre: {
      arbeitgeberName: row.arbeitgeberName,
      arbeitgeberStrasse: row.arbeitgeberStrasse,
      arbeitgeberPlzOrt: row.arbeitgeberPlzOrt,
      familienzulagenChf: row.familienzulagenChf,
      krankentaggeldChf: row.krankentaggeldChf,
      pkArbeitnehmerChf: row.pkArbeitnehmerChf,
      pkArbeitgeberChf: row.pkArbeitgeberChf,
      krankentaggeldArbeitgeberProzent: row.krankentaggeldArbeitgeberProzent,
      krankentaggeldArbeitgeberChf: row.krankentaggeldArbeitgeberChf,
      nbuvArbeitgeberProzent: row.nbuvArbeitgeberProzent,
      nbuvArbeitgeberChf: row.nbuvArbeitgeberChf,
      nGreSonderfaelle: row.nGreSonderfaelle,
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
  ['wechselkursMonat', null],
  ['wechselkursKurs', null],
  ['wechselkursModus', null],
  ['wechselkursBelegId', null],
  ['arbeitgeberName', null],
  ['arbeitgeberStrasse', null],
  ['arbeitgeberPlzOrt', null],
  ['familienzulagenChf', null],
  ['krankentaggeldChf', null],
  ['pkArbeitnehmerChf', null],
  ['pkArbeitgeberChf', null],
  ['krankentaggeldArbeitgeberProzent', null],
  ['krankentaggeldArbeitgeberChf', null],
  ['nbuvArbeitgeberProzent', null],
  ['nbuvArbeitgeberChf', null],
  ['nGreSonderfaelle', null],
])

@Injectable()
export class PrismaChSalaryCertificateRepository implements CrossBorderSalaryStatementRepository {
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async findForUserAndYear(userId: string, steuerjahr: number): Promise<CrossBorderSalaryStatementRecord | null> {
    const row = await this.prisma.chLohnausweis.findUnique({ where: { userId_steuerjahr: { userId, steuerjahr } } })
    return row === null ? null : toRecord(row as ChSalaryCertificateRow)
  }

  async setField(userId: string, steuerjahr: number, field: SalaryCertificateAmountFieldId, value: string | null): Promise<CrossBorderSalaryStatementRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.chLohnausweis.upsert({
        where: { userId_steuerjahr: { userId, steuerjahr } },
        create: { userId, steuerjahr, ...EMPTY_CREATE, ...fieldData(field, value) },
        update: fieldData(field, value),
      }),
      this.prisma.taxDataAccessLog.create({ data: { userId, action: 'WRITE', resource: 'ch-lohnausweis' } }),
    ])
    return toRecord(row as ChSalaryCertificateRow)
  }

  async setRemarks(userId: string, steuerjahr: number, text: string | null): Promise<CrossBorderSalaryStatementRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.chLohnausweis.upsert({
        where: { userId_steuerjahr: { userId, steuerjahr } },
        create: { userId, steuerjahr, ...EMPTY_CREATE, bemerkungen: text },
        update: { bemerkungen: text },
      }),
      this.prisma.taxDataAccessLog.create({ data: { userId, action: 'WRITE', resource: 'ch-lohnausweis' } }),
    ])
    return toRecord(row as ChSalaryCertificateRow)
  }

  async setProvision(userId: string, steuerjahr: number, saeule3aChf: string | null, krankenkasseChf: string | null): Promise<CrossBorderSalaryStatementRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.chLohnausweis.upsert({
        where: { userId_steuerjahr: { userId, steuerjahr } },
        create: { userId, steuerjahr, ...EMPTY_CREATE, saeule3aChf, krankenkasseChf },
        update: { saeule3aChf, krankenkasseChf },
      }),
      this.prisma.taxDataAccessLog.create({ data: { userId, action: 'WRITE', resource: 'ch-lohnausweis' } }),
    ])
    return toRecord(row as ChSalaryCertificateRow)
  }

  async setNGre(userId: string, steuerjahr: number, details: Partial<NGreDetails>): Promise<CrossBorderSalaryStatementRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.chLohnausweis.upsert({
        where: { userId_steuerjahr: { userId, steuerjahr } },
        create: { userId, steuerjahr, ...EMPTY_CREATE, ...details },
        update: details,
      }),
      this.prisma.taxDataAccessLog.create({ data: { userId, action: 'WRITE', resource: 'ch-lohnausweis' } }),
    ])
    return toRecord(row as ChSalaryCertificateRow)
  }

  async setExchangeRate(
    userId: string,
    steuerjahr: number,
    exchangeRate: { month: string; rate: number; mode: string; receiptId?: string },
  ): Promise<CrossBorderSalaryStatementRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.chLohnausweis.upsert({
        where: { userId_steuerjahr: { userId, steuerjahr } },
        create: {
          userId,
          steuerjahr,
          ...EMPTY_CREATE,
          wechselkursMonat: exchangeRate.month,
          wechselkursKurs: exchangeRate.rate,
          wechselkursModus: exchangeRate.mode,
          wechselkursBelegId: exchangeRate.receiptId ?? null,
        },
        update: {
          wechselkursMonat: exchangeRate.month,
          wechselkursKurs: exchangeRate.rate,
          wechselkursModus: exchangeRate.mode,
          wechselkursBelegId: exchangeRate.receiptId ?? null,
        },
      }),
      this.prisma.taxDataAccessLog.create({ data: { userId, action: 'WRITE', resource: 'ch-lohnausweis' } }),
    ])
    return toRecord(row as ChSalaryCertificateRow)
  }
}
