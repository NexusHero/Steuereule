import { Inject, Injectable } from '@nestjs/common'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import { STAMMDATEN_FELDER, type StammdatenRecord, type StammdatenRepository } from './stammdaten.repository.js'

function toRecord(row: StammdatenRecord): StammdatenRecord {
  const record = { religionEinwilligungAm: row.religionEinwilligungAm } as StammdatenRecord
  for (const feld of STAMMDATEN_FELDER) record[feld] = row[feld]
  return record
}

@Injectable()
export class PrismaStammdatenRepository implements StammdatenRepository {
  // ENCRYPTED_PRISMA: address, IBAN and religion are encrypted at rest (ADR-0008).
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async findByUserId(userId: string): Promise<StammdatenRecord | null> {
    const row = await this.prisma.stammdaten.findUnique({ where: { userId } })
    return row === null ? null : toRecord(row)
  }

  async speichere(userId: string, record: StammdatenRecord): Promise<StammdatenRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.stammdaten.upsert({ where: { userId }, create: { userId, ...record }, update: record }),
      this.prisma.taxDataAccessLog.create({ data: { userId, action: 'WRITE', resource: 'stammdaten' } }),
    ])
    return toRecord(row)
  }
}
