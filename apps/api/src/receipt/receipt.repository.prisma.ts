import { Inject, Injectable } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { RECEIPT_FOLDER_KINDS, isHolderRef, isReceiptReadOutcome, isReceiptReadReason, isReceiptType, type HolderRef, type ReceiptFolder, type ReceiptType } from '@steuereule/core'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { ReceiptFacts, ReceiptPageQuery, ReceiptRecord, ReceiptRepository, CreateReceiptData, RecordReadData, SetAssignmentData } from './receipt.repository.js'

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10)
}

function toRecord(row: {
  id: string
  userId: string
  fileName: string
  kind: string | null
  belegdatum: Date | null
  zahlungsdatum: Date | null
  taxYear: number | null
  proposalDismissed: boolean
  holders?: string | null
  holderTaxYear?: number | null
  readAt?: Date | null
  readOutcome?: string | null
  readReason?: string | null
  draftsTaxYear?: number | null
  direction?: string | null
  file?: { mimeType: string; byteLength: number } | null
  createdAt: Date
  updatedAt: Date
}): ReceiptRecord {
  return {
    id: row.id,
    userId: row.userId,
    fileName: row.fileName,
    ...(row.kind !== null ? { kind: (isReceiptType(row.kind) ? row.kind : (() => { throw new Error(`corrupt Beleg.art: ${row.kind}`) })()) } : {}),
    ...(row.belegdatum !== null ? { belegdatum: toIsoDate(row.belegdatum) } : {}),
    ...(row.direction === 'ausgabe' || row.direction === 'einnahme' ? { direction: row.direction } : {}),
    ...(row.zahlungsdatum !== null ? { zahlungsdatum: toIsoDate(row.zahlungsdatum) } : {}),
    taxYear: row.taxYear,
    proposalDismissed: row.proposalDismissed,
    holders: holdersOf(row.holders ?? null),
    holderTaxYear: row.holderTaxYear ?? null,
    readAt: row.readAt ?? null,
    // An unknown code (written by a newer version) reads as no fact rather than failing the inbox.
    readOutcome: isReceiptReadOutcome(row.readOutcome) ? row.readOutcome : null,
    readReason: isReceiptReadReason(row.readReason) ? row.readReason : null,
    draftsTaxYear: row.draftsTaxYear ?? null,
    ...(row.file !== undefined ? { fileMeta: row.file ? { mimeType: row.file.mimeType, byteLength: row.file.byteLength } : null } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/** The stored holders, the holder first; a value that is no reference is dropped rather than shown. */
function holdersOf(stored: string | null): HolderRef[] {
  return (stored ?? '').split(',').filter(isHolderRef)
}

const FILE_META_INCLUDE = {
  file: { select: { mimeType: true, byteLength: true } },
} as const

const FACT_KEYS: ReadonlySet<string> = new Set(['id', 'kind', 'taxYear', 'belegdatum', 'zahlungsdatum', 'proposalDismissed', 'readAt', 'readOutcome', 'readReason', 'draftsTaxYear', 'createdAt'])

/** The kinds a folder holds as a where clause; `weitere` is every other kind and a Beleg without one. */
function folderFilter(folder: ReceiptFolder): Prisma.ReceiptWhereInput {
  const named = Object.values(RECEIPT_FOLDER_KINDS).flat()
  if (folder === 'weitere') return { OR: [{ kind: null }, { kind: { notIn: [...named] } }] }
  return { kind: { in: [...RECEIPT_FOLDER_KINDS[folder]] } }
}

/**
 * The where clause of one inbox page. Folder and cursor are each an OR of their own, so they are
 * combined with AND: spread into one object, the cursor's OR would replace the folder's.
 */
export function receiptPageWhere(userId: string, query: ReceiptPageQuery): Prisma.ReceiptWhereInput {
  const and: Prisma.ReceiptWhereInput[] = []
  if (query.folder !== undefined) and.push(folderFilter(query.folder))
  if (query.after !== undefined) and.push({ OR: [{ createdAt: { lt: query.after.createdAt } }, { createdAt: query.after.createdAt, id: { lt: query.after.id } }] })
  return { userId, AND: and }
}

function toFacts(row: {
  id: string
  kind: string | null
  taxYear: number | null
  belegdatum: Date | null
  zahlungsdatum: Date | null
  proposalDismissed: boolean
  readAt: Date | null
  readOutcome: string | null
  readReason: string | null
  draftsTaxYear: number | null
  createdAt: Date
}): ReceiptFacts {
  const record = toRecord({ ...row, userId: '', fileName: '', updatedAt: row.createdAt })
  return Object.fromEntries(Object.entries(record).filter(([key]) => FACT_KEYS.has(key))) as unknown as ReceiptFacts
}

function fromIsoDate(value: string): Date {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new RangeError(`not a valid date: ${value}`)
  return date
}

@Injectable()
export class PrismaReceiptRepository implements ReceiptRepository {
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async findAllForUser(userId: string): Promise<ReceiptRecord[]> {
    const rows = await this.prisma.receipt.findMany({
      where: { userId },
      include: FILE_META_INCLUDE,
      orderBy: { createdAt: 'desc' },
    })
    return rows.map(toRecord)
  }

  async listFactsForUser(userId: string): Promise<ReceiptFacts[]> {
    const rows = await this.prisma.receipt.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        kind: true,
        taxYear: true,
        belegdatum: true,
        zahlungsdatum: true,
        proposalDismissed: true,
        readAt: true,
        readOutcome: true,
        readReason: true,
        draftsTaxYear: true,
        createdAt: true,
      },
    })
    return rows.map(toFacts)
  }

  async findPageForUser(userId: string, query: ReceiptPageQuery): Promise<ReceiptRecord[]> {
    const rows = await this.prisma.receipt.findMany({
      where: receiptPageWhere(userId, query),
      include: FILE_META_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit,
    })
    return rows.map(toRecord)
  }

  async findManyByIdsForUser(userId: string, ids: readonly string[]): Promise<ReceiptRecord[]> {
    if (ids.length === 0) return []
    const rows = await this.prisma.receipt.findMany({ where: { userId, id: { in: [...ids] } }, include: FILE_META_INCLUDE })
    return rows.map(toRecord)
  }

  async findByIdForUser(userId: string, id: string): Promise<ReceiptRecord | null> {
    const row = await this.prisma.receipt.findFirst({
      where: { id, userId },
      include: FILE_META_INCLUDE,
    })
    return row === null ? null : toRecord(row)
  }

  async create(userId: string, data: CreateReceiptData, maxRows: number): Promise<ReceiptRecord | null> {
    // The lock per account makes "count, then create" one step: without it, requests in parallel all read the
    // same count below the cap and all created their row (review of ADR-0108). It is released with the
    // transaction, and other accounts never wait on it.
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`receipt-rows:${userId}`}, 0))`
      if ((await tx.receipt.count({ where: { userId } })) >= maxRows) return null
      const row = await tx.receipt.create({
        data: {
          userId,
          fileName: data.fileName,
          ...(data.kind !== undefined ? { kind: data.kind } : {}),
          ...(data.belegdatum !== undefined ? { belegdatum: fromIsoDate(data.belegdatum) } : {}),
          ...(data.zahlungsdatum !== undefined ? { zahlungsdatum: fromIsoDate(data.zahlungsdatum) } : {}),
          ...(data.direction !== undefined ? { direction: data.direction } : {}),
        },
        include: FILE_META_INCLUDE,
      })
      await tx.taxDataAccessLog.create({ data: { userId, action: 'WRITE', resource: 'beleg' } })
      return toRecord(row)
    })
  }

  async setAssignment(userId: string, id: string, data: SetAssignmentData): Promise<ReceiptRecord | null> {
    const row = await this.prisma.receipt.findFirst({ where: { id, userId } })
    if (row === null) return null

    const [updated] = await this.prisma.$transaction([
      this.prisma.receipt.update({
        where: { id },
        data: { taxYear: data.taxYear, proposalDismissed: data.proposalDismissed },
        include: FILE_META_INCLUDE,
      }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'beleg' },
      }),
    ])
    return toRecord(updated)
  }

  async setHolders(userId: string, id: string, holders: readonly HolderRef[], taxYear: number): Promise<ReceiptRecord | null> {
    const row = await this.prisma.receipt.findFirst({ where: { id, userId }, select: { id: true } })
    if (row === null) return null
    const [updated] = await this.prisma.$transaction([
      this.prisma.receipt.update({
        where: { id },
        data: { holders: holders.length > 0 ? holders.join(',') : null, holderTaxYear: holders.length > 0 ? taxYear : null },
        include: FILE_META_INCLUDE,
      }),
      this.prisma.taxDataAccessLog.create({ data: { userId, action: 'WRITE', resource: 'beleg' } }),
    ])
    return toRecord(updated)
  }

  async setKind(userId: string, id: string, kind: ReceiptType): Promise<ReceiptRecord | null> {
    const row = await this.prisma.receipt.findFirst({ where: { id, userId }, select: { id: true } })
    if (row === null) return null
    const [updated] = await this.prisma.$transaction([
      this.prisma.receipt.update({ where: { id }, data: { kind }, include: FILE_META_INCLUDE }),
      this.prisma.taxDataAccessLog.create({ data: { userId, action: 'WRITE', resource: 'beleg' } }),
    ])
    return toRecord(updated)
  }

  async recordRead(userId: string, id: string, data: RecordReadData): Promise<ReceiptRecord | null> {
    const row = await this.prisma.receipt.findFirst({ where: { id, userId }, select: { id: true } })
    if (row === null) return null
    const [updated] = await this.prisma.$transaction([
      this.prisma.receipt.update({
        where: { id },
        data: {
          readAt: new Date(),
          readOutcome: data.outcome,
          readReason: data.reason,
          draftsTaxYear: data.draftsTaxYear,
          ...(data.taxYear !== undefined ? { taxYear: data.taxYear } : {}),
        },
        include: FILE_META_INCLUDE,
      }),
      this.prisma.taxDataAccessLog.create({ data: { userId, action: 'WRITE', resource: 'beleg' } }),
    ])
    return toRecord(updated)
  }

  async deleteForUser(userId: string, id: string): Promise<boolean> {
    const row = await this.prisma.receipt.findFirst({ where: { id, userId }, select: { id: true } })
    if (row === null) return false

    await this.prisma.$transaction([
      this.prisma.receipt.delete({ where: { id } }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'beleg' },
      }),
    ])
    return true
  }
}
