import { Inject, Injectable } from '@nestjs/common'
import type { IsoWeekday } from '@steuereule/core'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import { MEANS_OF_TRANSPORT, type CommuteInputs, type CommuteRepository, type MeansOfTransport } from './arbeitsweg.repository.js'

interface CommuteRow {
  arbeitstage: string
  urlaubstage: number
  krankheitstage: number
  homeofficeTage: number
  einfacheKm: number | null
  verkehrsmittel: string | null
  taetigkeitsstaette: string | null
  feiertage?: number | null
  feiertageRegion?: string | null
}

function inputsFrom(row: CommuteRow): CommuteInputs {
  return {
    arbeitstage: row.arbeitstage === '' ? [] : row.arbeitstage.split(',').map((tag) => Number(tag) as IsoWeekday),
    urlaubstage: row.urlaubstage,
    krankheitstage: row.krankheitstage,
    homeofficeTage: row.homeofficeTage,
    einfacheKm: row.einfacheKm,
    verkehrsmittel: MEANS_OF_TRANSPORT.includes(row.verkehrsmittel as MeansOfTransport) ? (row.verkehrsmittel as MeansOfTransport) : null,
    taetigkeitsstaette: row.taetigkeitsstaette,
    feiertage: row.feiertage ?? null,
    feiertageRegion: row.feiertageRegion ?? null,
  }
}

@Injectable()
export class PrismaCommuteRepository implements CommuteRepository {
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async findForUserAndYear(userId: string, steuerjahr: number): Promise<CommuteInputs | null> {
    const row = await this.prisma.arbeitsweg.findUnique({ where: { userId_steuerjahr: { userId, steuerjahr } } })
    return row === null ? null : inputsFrom(row)
  }

  async save(userId: string, steuerjahr: number, inputs: CommuteInputs): Promise<CommuteInputs> {
    const data = {
      arbeitstage: inputs.arbeitstage.join(','),
      urlaubstage: inputs.urlaubstage,
      krankheitstage: inputs.krankheitstage,
      homeofficeTage: inputs.homeofficeTage,
      einfacheKm: inputs.einfacheKm,
      verkehrsmittel: inputs.verkehrsmittel,
      taetigkeitsstaette: inputs.taetigkeitsstaette,
      feiertage: inputs.feiertage ?? null,
      feiertageRegion: inputs.feiertageRegion ?? null,
    }
    const [row] = await this.prisma.$transaction([
      this.prisma.arbeitsweg.upsert({
        where: { userId_steuerjahr: { userId, steuerjahr } },
        create: { userId, steuerjahr, ...data },
        update: data,
      }),
      this.prisma.taxDataAccessLog.create({ data: { userId, action: 'WRITE', resource: 'arbeitsweg' } }),
    ])
    return inputsFrom(row)
  }
}
