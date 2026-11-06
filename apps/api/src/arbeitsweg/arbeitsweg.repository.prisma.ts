import { Inject, Injectable } from '@nestjs/common'
import type { IsoWeekday } from '@steuereule/core'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import { MEANS_OF_TRANSPORT, type CommuteInputs, type CommuteRepository, type MeansOfTransport } from './arbeitsweg.repository.js'

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
}

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
