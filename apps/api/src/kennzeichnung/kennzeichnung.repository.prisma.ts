import { Inject, Injectable } from '@nestjs/common'
import { annexOf, type Annex, type Provenance, type Kennzeichnung } from '@steuereule/core'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { ProvenanceRecord, ProvenanceRepository } from './kennzeichnung.repository.js'

interface ProvenanceColumns {
  art: string
  name: string | null
  receiptId: string | null
  vorjahr: number | null
}

function provenanceFromColumns({ art, name, receiptId, vorjahr }: ProvenanceColumns): Provenance {
  switch (art) {
    case 'nutzer':
      return { art: 'nutzer' }
    case 'uebernahme':
      if (vorjahr === null) break
      return { art: 'uebernahme', vorjahr }
    case 'assistent':
      if (name === null) break
      return receiptId === null ? { art: 'assistent', name } : { art: 'assistent', name, receiptId }
    case 'beleg':
      if (receiptId === null) break
      return { art: 'beleg', receiptId }
  }
  throw new Error(`Kennzeichnung: stored Herkunft "${art}" is incomplete`)
}

function provenanceToColumns(h: Provenance): ProvenanceColumns {
  return {
    art: h.art,
    name: h.art === 'assistent' ? h.name : null,
    receiptId: h.art === 'beleg' || (h.art === 'assistent' && h.receiptId !== undefined) ? (h.receiptId ?? null) : null,
    vorjahr: h.art === 'uebernahme' ? h.vorjahr : null,
  }
}

interface Row {
  userId: string
  steuerjahr: number
  postenKey: string
  herkunftArt: string
  herkunftName: string | null
  herkunftBelegId: string | null
  vorjahr: number | null
  bestaetigt: boolean
  vorschlagHerkunftArt: string | null
  vorschlagHerkunftName: string | null
  vorschlagBelegId: string | null
  vorschlagVorjahr: number | null
  vorschlagWert: string | null
}

function toRecord(row: Row): ProvenanceRecord {
  return {
    userId: row.userId,
    steuerjahr: row.steuerjahr,
    key: row.postenKey,
    provenance: provenanceFromColumns({ art: row.herkunftArt, name: row.herkunftName, receiptId: row.herkunftBelegId, vorjahr: row.vorjahr }),
    bestaetigt: row.bestaetigt,
    proposal:
      row.vorschlagHerkunftArt === null
        ? null
        : {
            value: row.vorschlagWert,
            provenance: provenanceFromColumns({ art: row.vorschlagHerkunftArt, name: row.vorschlagHerkunftName, receiptId: row.vorschlagBelegId, vorjahr: row.vorschlagVorjahr }),
          },
  }
}

function toData(k: Omit<Kennzeichnung, 'value'>) {
  const h = provenanceToColumns(k.provenance)
  const v = k.proposal === null ? null : provenanceToColumns(k.proposal.provenance)
  return {
    anlage: annexOf(k.key),
    herkunftArt: h.art,
    herkunftName: h.name,
    herkunftBelegId: h.receiptId,
    vorjahr: h.vorjahr,
    bestaetigt: k.bestaetigt,
    vorschlagHerkunftArt: v?.art ?? null,
    vorschlagHerkunftName: v?.name ?? null,
    vorschlagBelegId: v?.receiptId ?? null,
    vorschlagVorjahr: v?.vorjahr ?? null,
    vorschlagWert: k.proposal?.value ?? null,
  }
}

@Injectable()
export class PrismaMarkingRepository implements ProvenanceRepository {
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async listForUserAndYears(userId: string, taxYears: readonly number[]): Promise<ProvenanceRecord[]> {
    const rows = await this.prisma.kennzeichnung.findMany({
      where: { userId, steuerjahr: { in: [...taxYears] } },
      orderBy: { postenKey: 'asc' },
    })
    return rows.map(toRecord)
  }

  async find(userId: string, steuerjahr: number, key: string): Promise<ProvenanceRecord | null> {
    const row = await this.prisma.kennzeichnung.findUnique({
      where: { userId_steuerjahr_postenKey: { userId, steuerjahr, postenKey: key } },
    })
    return row === null ? null : toRecord(row)
  }

  async save(userId: string, steuerjahr: number, marking: Omit<Kennzeichnung, 'value'>): Promise<ProvenanceRecord> {
    const data = toData(marking)
    const [row] = await this.prisma.$transaction([
      this.prisma.kennzeichnung.upsert({
        where: { userId_steuerjahr_postenKey: { userId, steuerjahr, postenKey: marking.key } },
        create: { userId, steuerjahr, postenKey: marking.key, ...data },
        update: data,
      }),
      this.prisma.taxDataAccessLog.create({ data: { userId, action: 'WRITE', resource: 'kennzeichnung' } }),
    ])
    return toRecord(row)
  }

  async remove(userId: string, steuerjahr: number, keys: readonly string[]): Promise<number> {
    if (keys.length === 0) return 0
    const { count } = await this.prisma.kennzeichnung.deleteMany({ where: { userId, steuerjahr, postenKey: { in: [...keys] } } })
    if (count > 0) {
      await this.prisma.taxDataAccessLog.create({ data: { userId, action: 'WRITE', resource: 'kennzeichnung' } })
    }
    return count
  }

  async confirmAnnex(userId: string, taxYears: readonly number[], anlage: Annex): Promise<number> {
    const [{ count }] = await this.prisma.$transaction([
      this.prisma.kennzeichnung.updateMany({
        where: { userId, steuerjahr: { in: [...taxYears] }, anlage, bestaetigt: false },
        data: { bestaetigt: true },
      }),
      this.prisma.taxDataAccessLog.create({ data: { userId, action: 'WRITE', resource: 'kennzeichnung' } }),
    ])
    return count
  }
}
