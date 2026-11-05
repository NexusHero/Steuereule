import { Inject, Injectable } from '@nestjs/common'
import type { IsoWochentag } from '@steuereule/core'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import { VERKEHRSMITTEL, type ArbeitswegEingaben, type ArbeitswegRepository, type Verkehrsmittel } from './arbeitsweg.repository.js'

interface ArbeitswegRow {
  arbeitstage: string
  urlaubstage: number
  krankheitstage: number
  homeofficeTage: number
  einfacheKm: number | null
  verkehrsmittel: string | null
  taetigkeitsstaette: string | null
}

function eingabenAus(row: ArbeitswegRow): ArbeitswegEingaben {
  return {
    arbeitstage: row.arbeitstage === '' ? [] : row.arbeitstage.split(',').map((tag) => Number(tag) as IsoWochentag),
    urlaubstage: row.urlaubstage,
    krankheitstage: row.krankheitstage,
    homeofficeTage: row.homeofficeTage,
    einfacheKm: row.einfacheKm,
    verkehrsmittel: VERKEHRSMITTEL.includes(row.verkehrsmittel as Verkehrsmittel) ? (row.verkehrsmittel as Verkehrsmittel) : null,
    taetigkeitsstaette: row.taetigkeitsstaette,
  }
}

@Injectable()
export class PrismaArbeitswegRepository implements ArbeitswegRepository {
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async findForUserAndYear(userId: string, steuerjahr: number): Promise<ArbeitswegEingaben | null> {
    const row = await this.prisma.arbeitsweg.findUnique({ where: { userId_steuerjahr: { userId, steuerjahr } } })
    return row === null ? null : eingabenAus(row)
  }

  async save(userId: string, steuerjahr: number, eingaben: ArbeitswegEingaben): Promise<ArbeitswegEingaben> {
    const data = {
      arbeitstage: eingaben.arbeitstage.join(','),
      urlaubstage: eingaben.urlaubstage,
      krankheitstage: eingaben.krankheitstage,
      homeofficeTage: eingaben.homeofficeTage,
      einfacheKm: eingaben.einfacheKm,
      verkehrsmittel: eingaben.verkehrsmittel,
      taetigkeitsstaette: eingaben.taetigkeitsstaette,
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
