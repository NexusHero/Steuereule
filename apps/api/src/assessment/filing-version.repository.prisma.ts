import { Inject, Injectable } from '@nestjs/common'
import { isAssessmentPositionId, isValidAssessmentPositionAmount, type AssessmentPositionValues, type Range } from '@steuereule/core'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { FilingVersionRecord, FilingVersionRepository } from './filing-version.repository.js'

type Row = { userId: string; taxYear: number; number: number; filingType: string; submittedOn: string; positions: string }

/** The stored JSON, taking only known positions with valid amounts: a damaged entry is dropped, not guessed. */
export function decodeFilingPositions(json: string): { positions: AssessmentPositionValues; estimateAtSubmission: Range | null } {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { positions: {}, estimateAtSubmission: null }
  }
  const raw = (parsed ?? {}) as { positions?: Record<string, unknown>; estimateAtSubmission?: { from?: unknown; to?: unknown } | null }
  const positions: Record<string, number> = {}
  for (const [id, value] of Object.entries(raw.positions ?? {})) {
    if (isAssessmentPositionId(id) && typeof value === 'number' && isValidAssessmentPositionAmount(id, value)) positions[id] = value
  }
  const e = raw.estimateAtSubmission
  const estimateAtSubmission = e && typeof e.from === 'number' && typeof e.to === 'number' ? { from: e.from, to: e.to } : null
  return { positions: positions as AssessmentPositionValues, estimateAtSubmission }
}

export function encodeFilingPositions(positions: AssessmentPositionValues, estimateAtSubmission: Range | null): string {
  return JSON.stringify({ positions, estimateAtSubmission })
}

function toRecord(row: Row): FilingVersionRecord {
  return {
    userId: row.userId,
    taxYear: row.taxYear,
    number: row.number,
    filingType: row.filingType === 'zusammen' ? 'zusammen' : 'einzel',
    submittedOn: row.submittedOn,
    ...decodeFilingPositions(row.positions),
  }
}

@Injectable()
export class PrismaFilingVersionRepository implements FilingVersionRepository {
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async findLatest(userId: string, taxYear: number): Promise<FilingVersionRecord | null> {
    const row = await this.prisma.filingVersion.findFirst({ where: { userId, taxYear }, orderBy: { number: 'desc' } })
    return row === null ? null : toRecord(row)
  }

  async listLatestForUser(userId: string): Promise<FilingVersionRecord[]> {
    const rows = await this.prisma.filingVersion.findMany({ where: { userId }, orderBy: [{ taxYear: 'asc' }, { number: 'desc' }] })
    const latest = new Map<number, Row>()
    for (const row of rows) if (!latest.has(row.taxYear)) latest.set(row.taxYear, row)
    return [...latest.values()].map(toRecord)
  }
}
