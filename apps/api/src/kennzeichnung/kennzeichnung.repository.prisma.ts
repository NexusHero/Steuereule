import { Inject, Injectable } from '@nestjs/common'
import { annexOf, type Annex, type Provenance, type Marking } from '@steuereule/core'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { ProvenanceRecord, ProvenanceRepository } from './kennzeichnung.repository.js'

interface ProvenanceColumns {
  kind: string
  name: string | null
  receiptId: string | null
  lastYear: number | null
}

function provenanceFromColumns({ kind, name, receiptId, lastYear }: ProvenanceColumns): Provenance {
  switch (kind) {
    case 'nutzer':
      return { kind: 'nutzer' }
    case 'uebernahme':
      if (lastYear === null) break
      return { kind: 'uebernahme', lastYear }
    case 'assistent':
      if (name === null) break
      return receiptId === null ? { kind: 'assistent', name } : { kind: 'assistent', name, receiptId }
    case 'beleg':
      if (receiptId === null) break
      return { kind: 'beleg', receiptId }
  }
  throw new Error(`Kennzeichnung: stored Herkunft "${kind}" is incomplete`)
}

function provenanceToColumns(h: Provenance): ProvenanceColumns {
  return {
    kind: h.kind,
    name: h.kind === 'assistent' ? h.name : null,
    receiptId: h.kind === 'beleg' || (h.kind === 'assistent' && h.receiptId !== undefined) ? (h.receiptId ?? null) : null,
    lastYear: h.kind === 'uebernahme' ? h.lastYear : null,
  }
}

interface Row {
  userId: string
  taxYear: number
  itemKey: string
  provenanceKind: string
  provenanceName: string | null
  provenanceReceiptId: string | null
  lastYear: number | null
  confirmed: boolean
  proposalProvenanceKind: string | null
  proposalProvenanceName: string | null
  proposalReceiptId: string | null
  proposalLastYear: number | null
  proposalValue: string | null
}

function toRecord(row: Row): ProvenanceRecord {
  return {
    userId: row.userId,
    taxYear: row.taxYear,
    key: row.itemKey,
    provenance: provenanceFromColumns({ kind: row.provenanceKind, name: row.provenanceName, receiptId: row.provenanceReceiptId, lastYear: row.lastYear }),
    confirmed: row.confirmed,
    proposal:
      row.proposalProvenanceKind === null
        ? null
        : {
            value: row.proposalValue,
            provenance: provenanceFromColumns({ kind: row.proposalProvenanceKind, name: row.proposalProvenanceName, receiptId: row.proposalReceiptId, lastYear: row.proposalLastYear }),
          },
  }
}

function toData(k: Omit<Marking, 'value'>) {
  const h = provenanceToColumns(k.provenance)
  const v = k.proposal === null ? null : provenanceToColumns(k.proposal.provenance)
  return {
    annex: annexOf(k.key),
    provenanceKind: h.kind,
    provenanceName: h.name,
    provenanceReceiptId: h.receiptId,
    lastYear: h.lastYear,
    confirmed: k.confirmed,
    proposalProvenanceKind: v?.kind ?? null,
    proposalProvenanceName: v?.name ?? null,
    proposalReceiptId: v?.receiptId ?? null,
    proposalLastYear: v?.lastYear ?? null,
    proposalValue: k.proposal?.value ?? null,
  }
}

@Injectable()
export class PrismaMarkingRepository implements ProvenanceRepository {
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async listForUserAndYears(userId: string, taxYears: readonly number[]): Promise<ProvenanceRecord[]> {
    const rows = await this.prisma.marking.findMany({
      where: { userId, taxYear: { in: [...taxYears] } },
      orderBy: { itemKey: 'asc' },
    })
    return rows.map(toRecord)
  }

  async find(userId: string, taxYear: number, key: string): Promise<ProvenanceRecord | null> {
    const row = await this.prisma.marking.findUnique({
      where: { userId_taxYear_itemKey: { userId, taxYear, itemKey: key } },
    })
    return row === null ? null : toRecord(row)
  }

  async save(userId: string, taxYear: number, marking: Omit<Marking, 'value'>): Promise<ProvenanceRecord> {
    const data = toData(marking)
    const [row] = await this.prisma.$transaction([
      this.prisma.marking.upsert({
        where: { userId_taxYear_itemKey: { userId, taxYear, itemKey: marking.key } },
        create: { userId, taxYear, itemKey: marking.key, ...data },
        update: data,
      }),
      this.prisma.taxDataAccessLog.create({ data: { userId, action: 'WRITE', resource: 'kennzeichnung' } }),
    ])
    return toRecord(row)
  }

  async remove(userId: string, taxYear: number, keys: readonly string[]): Promise<number> {
    if (keys.length === 0) return 0
    const { count } = await this.prisma.marking.deleteMany({ where: { userId, taxYear, itemKey: { in: [...keys] } } })
    if (count > 0) {
      await this.prisma.taxDataAccessLog.create({ data: { userId, action: 'WRITE', resource: 'kennzeichnung' } })
    }
    return count
  }

  async confirmAnnex(userId: string, taxYears: readonly number[], annex: Annex): Promise<number> {
    const [{ count }] = await this.prisma.$transaction([
      this.prisma.marking.updateMany({
        where: { userId, taxYear: { in: [...taxYears] }, annex, confirmed: false },
        data: { confirmed: true },
      }),
      this.prisma.taxDataAccessLog.create({ data: { userId, action: 'WRITE', resource: 'kennzeichnung' } }),
    ])
    return count
  }
}
