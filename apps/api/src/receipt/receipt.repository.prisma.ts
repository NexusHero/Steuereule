import { Inject, Injectable } from '@nestjs/common'
import { isReceiptType } from '@steuereule/core'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { ReceiptRecord, ReceiptRepository, CreateReceiptData, SetAssignmentData } from './receipt.repository.js'

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
    ...(row.zahlungsdatum !== null ? { zahlungsdatum: toIsoDate(row.zahlungsdatum) } : {}),
    taxYear: row.taxYear,
    proposalDismissed: row.proposalDismissed,
    ...(row.file !== undefined ? { fileMeta: row.file ? { mimeType: row.file.mimeType, byteLength: row.file.byteLength } : null } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

const FILE_META_INCLUDE = {
  file: { select: { mimeType: true, byteLength: true } },
} as const

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

  async findByIdForUser(userId: string, id: string): Promise<ReceiptRecord | null> {
    const row = await this.prisma.receipt.findFirst({
      where: { id, userId },
      include: FILE_META_INCLUDE,
    })
    return row === null ? null : toRecord(row)
  }

  async create(userId: string, data: CreateReceiptData): Promise<ReceiptRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.receipt.create({
        data: {
          userId,
          fileName: data.fileName,
          ...(data.kind !== undefined ? { kind: data.kind } : {}),
          ...(data.belegdatum !== undefined ? { belegdatum: fromIsoDate(data.belegdatum) } : {}),
          ...(data.zahlungsdatum !== undefined ? { zahlungsdatum: fromIsoDate(data.zahlungsdatum) } : {}),
        },
        include: FILE_META_INCLUDE,
      }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'beleg' },
      }),
    ])
    return toRecord(row)
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
