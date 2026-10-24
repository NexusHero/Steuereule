import { Inject, Injectable } from '@nestjs/common'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { BelegRecord, BelegRepository, CreateBelegData } from './beleg.repository.js'

/** A Date → ISO yyyy-mm-dd, dropping the time-of-day Prisma's TIMESTAMP(3) also stores. */
function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10)
}

/** The persisted-facts record, with absent dates omitted (exactOptionalPropertyTypes). */
function toRecord(row: {
  id: string
  userId: string
  dateiname: string
  belegdatum: Date | null
  zahlungsdatum: Date | null
  steuerjahr: number | null
  createdAt: Date
  updatedAt: Date
}): BelegRecord {
  return {
    id: row.id,
    userId: row.userId,
    dateiname: row.dateiname,
    ...(row.belegdatum !== null ? { belegdatum: toIsoDate(row.belegdatum) } : {}),
    ...(row.zahlungsdatum !== null ? { zahlungsdatum: toIsoDate(row.zahlungsdatum) } : {}),
    steuerjahr: row.steuerjahr,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/** A ISO yyyy-mm-dd → Date, so a write side never constructs a partial date object. */
function fromIsoDate(value: string): Date {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new RangeError(`not a valid date: ${value}`)
  return date
}

@Injectable()
export class PrismaBelegRepository implements BelegRepository {
  // ENCRYPTED_PRISMA, never plain PrismaService — `dateiname` is field-encrypted at rest
  // (ADR-0008), and this is the only place Beleg rows are read/written, so it's the only
  // place that needs to (transparently) encrypt/decrypt. Mirrors PrismaProfileRepository.
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async findAllForUser(userId: string): Promise<BelegRecord[]> {
    const rows = await this.prisma.beleg.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } })
    return rows.map(toRecord)
  }

  async findByIdForUser(userId: string, id: string): Promise<BelegRecord | null> {
    const row = await this.prisma.beleg.findFirst({ where: { id, userId } })
    return row === null ? null : toRecord(row)
  }

  async create(userId: string, data: CreateBelegData): Promise<BelegRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.beleg.create({
        data: {
          userId,
          dateiname: data.dateiname,
          ...(data.belegdatum !== undefined ? { belegdatum: fromIsoDate(data.belegdatum) } : {}),
          ...(data.zahlungsdatum !== undefined ? { zahlungsdatum: fromIsoDate(data.zahlungsdatum) } : {}),
        },
      }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'beleg' },
      }),
    ])
    return toRecord(row)
  }

  async setSteuerjahr(userId: string, id: string, steuerjahr: number): Promise<BelegRecord | null> {
    const row = await this.prisma.beleg.findFirst({ where: { id, userId } })
    if (row === null) return null

    const [updated] = await this.prisma.$transaction([
      this.prisma.beleg.update({ where: { id }, data: { steuerjahr } }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'beleg' },
      }),
    ])
    return toRecord(updated)
  }
}
