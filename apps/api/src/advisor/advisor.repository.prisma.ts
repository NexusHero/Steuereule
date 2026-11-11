import { Inject, Injectable } from '@nestjs/common'
import {
  ADVISOR_FEEDBACK_RATINGS,
  ADVISOR_FEEDBACK_REASONS,
  ADVISOR_MESSAGE_STATUSES,
  type AdvisorFeedbackRating,
  type AdvisorFeedbackReason,
  type AdvisorMessageFeedback,
  type AdvisorMessageMeta,
  type AdvisorMessageStatus,
} from '@steuereule/core'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import {
  matchesActionId,
  type AdvisorChatMessageRecord,
  type AdvisorMessageUsage,
  type AdvisorRepository,
  type CreateAdvisorMessageInput,
  type FinishAdvisorMessageInput,
} from './advisor.repository.js'

function parseJson<T>(json: string | null): T | null {
  if (!json) return null
  try {
    return JSON.parse(json) as T
  } catch {
    return null
  }
}

function toStatus(raw: string): AdvisorMessageStatus {
  return (ADVISOR_MESSAGE_STATUSES as readonly string[]).includes(raw) ? (raw as AdvisorMessageStatus) : 'complete'
}

function toFeedback(rating: string | null, reason: string | null): AdvisorMessageFeedback | null {
  if (!rating || !(ADVISOR_FEEDBACK_RATINGS as readonly string[]).includes(rating)) return null
  const knownReason = reason !== null && (ADVISOR_FEEDBACK_REASONS as readonly string[]).includes(reason)
  return {
    rating: rating as AdvisorFeedbackRating,
    ...(knownReason ? { reason: reason as AdvisorFeedbackReason } : {}),
  }
}

function toRecord(row: {
  id: string
  userId: string
  taxYear: number
  role: string
  content: string
  metaJson: string | null
  createdAt: Date
  status: string
  reasoning: string | null
  runId: string | null
  feedbackRating: string | null
  feedbackReason: string | null
  usageJson: string | null
}): AdvisorChatMessageRecord {
  return {
    id: row.id,
    userId: row.userId,
    taxYear: row.taxYear,
    role: row.role === 'user' ? 'user' : 'assistant',
    content: row.content,
    meta: parseJson<AdvisorMessageMeta>(row.metaJson),
    createdAt: row.createdAt,
    status: toStatus(row.status),
    reasoning: row.reasoning,
    runId: row.runId,
    feedback: toFeedback(row.feedbackRating, row.feedbackReason),
    usage: parseJson<AdvisorMessageUsage>(row.usageJson),
  }
}

@Injectable()
export class PrismaAdvisorRepository implements AdvisorRepository {
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async listForUserAndYear(userId: string, taxYear: number): Promise<AdvisorChatMessageRecord[]> {
    const rows = await this.prisma.advisorChatMessage.findMany({
      where: { userId, taxYear },
      orderBy: { createdAt: 'asc' },
    })
    return rows.map(toRecord)
  }

  async countUserMessagesSince(userId: string, since: Date): Promise<number> {
    return this.prisma.advisorChatMessage.count({
      where: {
        userId,
        role: 'user',
        createdAt: { gte: since },
      },
    })
  }

  async createMessage(input: CreateAdvisorMessageInput): Promise<AdvisorChatMessageRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.advisorChatMessage.create({
        data: {
          userId: input.userId,
          taxYear: input.taxYear,
          role: input.role,
          content: input.content,
          metaJson: input.meta ? JSON.stringify(input.meta) : null,
          status: input.status ?? 'complete',
          runId: input.runId ?? null,
        },
      }),
      this.prisma.taxDataAccessLog.create({
        data: { userId: input.userId, action: 'WRITE', resource: 'berater_nachricht' },
      }),
    ])
    return toRecord(row)
  }

  async findMessageByActionId(
    userId: string,
    taxYear: number,
    actionId: string,
  ): Promise<AdvisorChatMessageRecord | null> {
    const rows = await this.listForUserAndYear(userId, taxYear)
    return rows.find((r) => matchesActionId(r.meta, actionId)) ?? null
  }

  async updateMessageMeta(
    id: string,
    userId: string,
    meta: AdvisorMessageMeta,
  ): Promise<AdvisorChatMessageRecord> {
    const row = await this.prisma.advisorChatMessage.update({
      where: { id },
      data: { metaJson: JSON.stringify(meta) },
    })
    if (row.userId !== userId) {
      throw new Error('Unauthorized message update')
    }
    return toRecord(row)
  }

  async findMessage(id: string, userId: string): Promise<AdvisorChatMessageRecord | null> {
    const row = await this.prisma.advisorChatMessage.findFirst({ where: { id, userId } })
    return row ? toRecord(row) : null
  }

  async finishMessage(id: string, userId: string, input: FinishAdvisorMessageInput): Promise<AdvisorChatMessageRecord> {
    // Scoped by owner in the WHERE clause, so a foreign id changes nothing instead of being rolled back.
    const { count } = await this.prisma.advisorChatMessage.updateMany({
      where: { id, userId },
      data: {
        content: input.content,
        metaJson: input.meta ? JSON.stringify(input.meta) : null,
        status: input.status,
        reasoning: input.reasoning,
        runId: null,
        usageJson: input.usage ? JSON.stringify(input.usage) : null,
      },
    })
    const row = count === 1 ? await this.prisma.advisorChatMessage.findFirst({ where: { id, userId } }) : null
    if (!row) throw new Error(`AdvisorChatMessage ${id} not found`)
    return toRecord(row)
  }

  async setFeedback(id: string, userId: string, feedback: AdvisorMessageFeedback | null): Promise<AdvisorChatMessageRecord | null> {
    const { count } = await this.prisma.advisorChatMessage.updateMany({
      where: { id, userId },
      data: { feedbackRating: feedback?.rating ?? null, feedbackReason: feedback?.reason ?? null },
    })
    if (count !== 1) return null
    return this.findMessage(id, userId)
  }

  async deleteForUserAndYear(userId: string, taxYear: number): Promise<number> {
    const [{ count }] = await this.prisma.$transaction([
      this.prisma.advisorChatMessage.deleteMany({ where: { userId, taxYear } }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'berater_nachricht_loeschen' },
      }),
    ])
    return count
  }
}
