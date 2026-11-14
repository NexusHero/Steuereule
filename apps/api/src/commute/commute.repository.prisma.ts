import { Inject, Injectable } from '@nestjs/common'
import type { IsoWeekday } from '@steuereule/core'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import { MEANS_OF_TRANSPORT, WAY_TEXT_FIELDS, WORK_EXPENSE_AMOUNT_FIELDS, WORK_EXPENSE_NOTE_FIELDS, type CommuteInputs, type CommuteRepository, type MeansOfTransport } from './commute.repository.js'

interface CommuteRow {
  workdays: string
  vacationDays: number
  sickDays: number
  homeOfficeDays: number
  oneWayKm: number | null
  transport: string | null
  workplace: string | null
  publicHolidays?: number | null
  publicHolidayRegion?: string | null
  professionalBodiesEur?: string | null
  professionalBodiesNote?: string | null
  workEquipmentEur?: string | null
  workEquipmentNote?: string | null
  accountFeesEur?: string | null
  otherWorkExpensesEur?: string | null
  otherWorkExpensesNote?: string | null
  periodFrom?: string | null
  periodTo?: string | null
  secondOneWayKm?: number | null
  secondTransport?: string | null
  secondWorkplace?: string | null
  secondFrom?: string | null
  secondTo?: string | null
}

const wholeEuros = (raw: string | null | undefined): number | null => (raw !== null && raw !== undefined && /^\d+$/.test(raw) ? Number(raw) : null)

function inputsFrom(row: CommuteRow): CommuteInputs {
  return {
    workdays: row.workdays === '' ? [] : row.workdays.split(',').map((tag) => Number(tag) as IsoWeekday),
    vacationDays: row.vacationDays,
    sickDays: row.sickDays,
    homeOfficeDays: row.homeOfficeDays,
    oneWayKm: row.oneWayKm,
    transport: MEANS_OF_TRANSPORT.includes(row.transport as MeansOfTransport) ? (row.transport as MeansOfTransport) : null,
    workplace: row.workplace,
    publicHolidays: row.publicHolidays ?? null,
    publicHolidayRegion: row.publicHolidayRegion ?? null,
    ...Object.fromEntries(WORK_EXPENSE_AMOUNT_FIELDS.map((f) => [f, wholeEuros(row[f])])),
    ...Object.fromEntries(WORK_EXPENSE_NOTE_FIELDS.map((f) => [f, row[f] ?? null])),
    periodFrom: row.periodFrom ?? null,
    periodTo: row.periodTo ?? null,
    secondOneWayKm: row.secondOneWayKm ?? null,
    secondTransport: MEANS_OF_TRANSPORT.includes(row.secondTransport as MeansOfTransport) ? (row.secondTransport as MeansOfTransport) : null,
    secondWorkplace: row.secondWorkplace ?? null,
    secondFrom: row.secondFrom ?? null,
    secondTo: row.secondTo ?? null,
  }
}

@Injectable()
export class PrismaCommuteRepository implements CommuteRepository {
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async findForUserAndYear(userId: string, taxYear: number): Promise<CommuteInputs | null> {
    const row = await this.prisma.commute.findUnique({ where: { userId_taxYear: { userId, taxYear } } })
    return row === null ? null : inputsFrom(row)
  }

  async save(userId: string, taxYear: number, inputs: CommuteInputs): Promise<CommuteInputs> {
    const data = {
      workdays: inputs.workdays.join(','),
      vacationDays: inputs.vacationDays,
      sickDays: inputs.sickDays,
      homeOfficeDays: inputs.homeOfficeDays,
      oneWayKm: inputs.oneWayKm,
      transport: inputs.transport,
      workplace: inputs.workplace,
      publicHolidays: inputs.publicHolidays ?? null,
      publicHolidayRegion: inputs.publicHolidayRegion ?? null,
      // Further Werbungskosten: a save that does not carry them keeps what is stored.
      ...Object.fromEntries(
        WORK_EXPENSE_AMOUNT_FIELDS.filter((f) => inputs[f] !== undefined).map((f) => [f, inputs[f] === null ? null : String(inputs[f])]),
      ),
      ...Object.fromEntries(WORK_EXPENSE_NOTE_FIELDS.filter((f) => inputs[f] !== undefined).map((f) => [f, inputs[f] ?? null])),
      // The period and the second way: likewise kept when a save does not carry them.
      ...Object.fromEntries(WAY_TEXT_FIELDS.filter((f) => inputs[f] !== undefined).map((f) => [f, inputs[f] ?? null])),
      ...(inputs.secondOneWayKm !== undefined ? { secondOneWayKm: inputs.secondOneWayKm } : {}),
    }
    const [row] = await this.prisma.$transaction([
      this.prisma.commute.upsert({
        where: { userId_taxYear: { userId, taxYear } },
        create: { userId, taxYear, ...data },
        update: data,
      }),
      this.prisma.taxDataAccessLog.create({ data: { userId, action: 'WRITE', resource: 'arbeitsweg' } }),
    ])
    return inputsFrom(row)
  }
}
