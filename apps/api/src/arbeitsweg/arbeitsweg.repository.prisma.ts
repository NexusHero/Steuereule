import { Inject, Injectable } from '@nestjs/common'
import type { IsoWochentag } from '@steuereule/core'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import { VERKEHRSMITTEL, type CommuteInputs, type CommuteRepository, type Verkehrsmittel } from './arbeitsweg.repository.js'

interface ArbeitswegRow {
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

function eingabenAus(row: ArbeitswegRow): CommuteInputs {
  return {
    arbeitstage: row.arbeitstage === '' ? [] : row.arbeitstage.split(',').map((tag) => Number(tag) as IsoWochentag),
    urlaubstage: row.urlaubstage,
    krankheitstage: row.krankheitstage,
    homeofficeTage: row.homeofficeTage,
    einfacheKm: row.einfacheKm,
    verkehrsmittel: VERKEHRSMITTEL.includes(row.verkehrsmittel as Verkehrsmittel) ? (row.verkehrsmittel as Verkehrsmittel) : null,
    taetigkeitsstaette: row.taetigkeitsstaette,
    feiertage: row.feiertage ?? null,
    feiertageRegion: row.feiertageRegion ?? null,
  }
}

@Injectable()
export class PrismaArbeitswegRepository implements CommuteRepository {
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async findForUserAndYear(userId: string, steuerjahr: number): Promise<CommuteInputs | null> {
    const row = await this.prisma.arbeitsweg.findUnique({ where: { userId_steuerjahr: { userId, steuerjahr } } })
    return row === null ? null : eingabenAus(row)
  }

  async save(userId: string, steuerjahr: number, eingaben: CommuteInputs): Promise<CommuteInputs> {
    const data = {
      arbeitstage: eingaben.arbeitstage.join(','),
      urlaubstage: eingaben.urlaubstage,
      krankheitstage: eingaben.krankheitstage,
      homeofficeTage: eingaben.homeofficeTage,
      einfacheKm: eingaben.einfacheKm,
      verkehrsmittel: eingaben.verkehrsmittel,
      taetigkeitsstaette: eingaben.taetigkeitsstaette,
      feiertage: eingaben.feiertage ?? null,
      feiertageRegion: eingaben.feiertageRegion ?? null,
    }
    const [row] = await this.prisma.$transaction([
      this.prisma.arbeitsweg.upsert({
        where: { userId_steuerjahr: { userId, steuerjahr } },
        create: { userId, steuerjahr, ...data },
        update: data,
      }),
      this.prisma.taxDataAccessLog.create({ data: { userId, action: 'WRITE', resource: 'arbeitsweg' } }),
    ])
    return eingabenAus(row)
  }
}
