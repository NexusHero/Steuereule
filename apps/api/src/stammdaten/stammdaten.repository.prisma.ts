import { Inject, Injectable } from '@nestjs/common'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import { MASTER_DATA_FIELDS, type MasterDataRecord, type MasterDataRepository } from './stammdaten.repository.js'

function toRecord(row: MasterDataRecord): MasterDataRecord {
  const record = { religionEinwilligungAm: row.religionEinwilligungAm } as MasterDataRecord
  for (const feld of MASTER_DATA_FIELDS) record[feld] = row[feld]
  return record
}

@Injectable()
export class PrismaStammdatenRepository implements MasterDataRepository {
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async findByUserId(userId: string): Promise<MasterDataRecord | null> {
    const row = await this.prisma.stammdaten.findUnique({ where: { userId } })
    return row === null ? null : toRecord(row)
  }

  async save(userId: string, record: MasterDataRecord): Promise<MasterDataRecord> {
    return this.speichere(userId, record)
  }

  async speichere(userId: string, record: MasterDataRecord): Promise<MasterDataRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.stammdaten.upsert({ where: { userId }, create: { userId, ...record }, update: record }),
      this.prisma.taxDataAccessLog.create({ data: { userId, action: 'WRITE', resource: 'stammdaten' } }),
    ])
    return toRecord(row)
  }
}
