import { Inject, Injectable } from '@nestjs/common'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import { MASTER_DATA_FIELDS, type MasterDataRecord, type MasterDataRepository } from './stammdaten.repository.js'

function toRecord(row: MasterDataRecord): MasterDataRecord {
  const record = { religionEinwilligungAm: row.religionEinwilligungAm } as MasterDataRecord
  for (const field of MASTER_DATA_FIELDS) record[field] = row[field]
  return record
}

@Injectable()
export class PrismaMasterDataRepository implements MasterDataRepository {
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async findByUserId(userId: string): Promise<MasterDataRecord | null> {
    const row = await this.prisma.masterData.findUnique({ where: { userId } })
    return row === null ? null : toRecord(row)
  }

  async save(userId: string, record: MasterDataRecord): Promise<MasterDataRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.masterData.upsert({ where: { userId }, create: { userId, ...record }, update: record }),
      this.prisma.taxDataAccessLog.create({ data: { userId, action: 'WRITE', resource: 'stammdaten' } }),
    ])
    return toRecord(row)
  }
}
