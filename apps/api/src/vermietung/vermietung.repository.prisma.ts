import { Inject, Injectable } from '@nestjs/common'
import type { VermietungFeldId } from '@steuereule/core'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { VermietungsobjektRecord, VermietungRepository } from './vermietung.repository.js'

/** The persisted-facts record, narrowed to what the service needs. */
function toRecord(row: {
  id: string
  userId: string
  steuerjahr: number
  mieteinnahmen: string | null
  anschaffungskosten: string | null
  baujahr: string | null
  werbungskosten: string | null
}): VermietungsobjektRecord {
  return {
    id: row.id,
    userId: row.userId,
    steuerjahr: row.steuerjahr,
    mieteinnahmen: row.mieteinnahmen,
    anschaffungskosten: row.anschaffungskosten,
    baujahr: row.baujahr,
    werbungskosten: row.werbungskosten,
  }
}

/** The one-keyed update payload for `feld` — typed, never a computed `{[feld]: wert}`. */
function feldData(
  feld: VermietungFeldId,
  wert: string | null,
): { mieteinnahmen?: string | null; anschaffungskosten?: string | null; baujahr?: string | null; werbungskosten?: string | null } {
  switch (feld) {
    case 'mieteinnahmen':
      return { mieteinnahmen: wert }
    case 'anschaffungskosten':
      return { anschaffungskosten: wert }
    case 'baujahr':
      return { baujahr: wert }
    case 'werbungskosten':
      return { werbungskosten: wert }
  }
}

@Injectable()
export class PrismaVermietungRepository implements VermietungRepository {
  // ENCRYPTED_PRISMA, never plain PrismaService — the four figures are field-encrypted at rest
  // (ADR-0008): rental income, acquisition costs, the Baujahr that fixes the AfA and the running
  // Werbungskosten, joinable to Profile's Steuer-ID via the same userId (see schema.prisma's
  // Vermietungsobjekt doc).
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async listForUserAndYear(userId: string, steuerjahr: number): Promise<VermietungsobjektRecord[]> {
    const rows = await this.prisma.vermietungsobjekt.findMany({
      where: { userId, steuerjahr },
      orderBy: { createdAt: 'asc' },
    })
    return rows.map(toRecord)
  }

  async create(userId: string, steuerjahr: number): Promise<VermietungsobjektRecord> {
    const [row] = await this.prisma.$transaction([
      // A fresh object seeds every field as null (`offen`) — an honest empty mask, never a
      // fabricated figure.
      this.prisma.vermietungsobjekt.create({
        data: { userId, steuerjahr, mieteinnahmen: null, anschaffungskosten: null, baujahr: null, werbungskosten: null },
      }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'vermietung' },
      }),
    ])
    return toRecord(row)
  }

  async setFeld(
    userId: string,
    steuerjahr: number,
    objektId: string,
    feld: VermietungFeldId,
    wert: string | null,
  ): Promise<VermietungsobjektRecord | null> {
    // Scoped by userId+steuerjahr+id — a foreign objektId finds nothing (never a cross-user
    // update), and updateMany tells us that honestly (0 rows → null).
    const existing = await this.prisma.vermietungsobjekt.findFirst({ where: { id: objektId, userId, steuerjahr } })
    if (existing === null) return null

    const [row] = await this.prisma.$transaction([
      this.prisma.vermietungsobjekt.update({ where: { id: objektId }, data: feldData(feld, wert) }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'vermietung' },
      }),
    ])
    return toRecord(row)
  }
}
