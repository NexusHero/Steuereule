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
  type AdvisorConversationChange,
  type AdvisorConversationRecord,
  type AdvisorMessageUsage,
  type AdvisorNoteAuthor,
  type AdvisorNoteRecord,
  type AdvisorSituationRecord,
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
  conversationId: string | null
}): AdvisorChatMessageRecord {
  return {
    id: row.id,
    userId: row.userId,
    taxYear: row.taxYear,
    // Every message carries a conversation since the migration of #481.
    conversationId: row.conversationId ?? '',
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

function toNote(row: { id: string; userId: string; taxYear: number; text: string; author: string; createdAt: Date; updatedAt: Date }): AdvisorNoteRecord {
  return { ...row, author: row.author === 'user' ? 'user' : 'owl' }
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

  async listForConversation(conversationId: string, userId: string): Promise<AdvisorChatMessageRecord[]> {
    const rows = await this.prisma.advisorChatMessage.findMany({ where: { conversationId, userId }, orderBy: { createdAt: 'asc' } })
    return rows.map(toRecord)
  }

  async listConversations(userId: string, taxYear: number): Promise<AdvisorConversationRecord[]> {
    return this.prisma.advisorConversation.findMany({ where: { userId, taxYear }, orderBy: { lastUsedAt: 'desc' } })
  }

  async findConversation(id: string, userId: string): Promise<AdvisorConversationRecord | null> {
    return this.prisma.advisorConversation.findFirst({ where: { id, userId } })
  }

  async createConversation(userId: string, taxYear: number, title: string | null = null): Promise<AdvisorConversationRecord> {
    return this.prisma.advisorConversation.create({ data: { userId, taxYear, title } })
  }

  async defaultConversation(userId: string, taxYear: number): Promise<AdvisorConversationRecord> {
    const latest = await this.prisma.advisorConversation.findFirst({ where: { userId, taxYear }, orderBy: { lastUsedAt: 'desc' } })
    return latest ?? this.createConversation(userId, taxYear)
  }

  async updateConversation(id: string, userId: string, change: AdvisorConversationChange): Promise<AdvisorConversationRecord | null> {
    const { count } = await this.prisma.advisorConversation.updateMany({ where: { id, userId }, data: change })
    return count === 1 ? this.findConversation(id, userId) : null
  }

  async deleteConversation(id: string, userId: string): Promise<number | null> {
    if (!(await this.findConversation(id, userId))) return null
    const [messages] = await this.prisma.$transaction([
      this.prisma.advisorChatMessage.deleteMany({ where: { conversationId: id, userId } }),
      this.prisma.advisorConversation.deleteMany({ where: { id, userId } }),
      this.prisma.taxDataAccessLog.create({ data: { userId, action: 'WRITE', resource: 'berater_gespraech_loeschen' } }),
    ])
    return messages.count
  }

  async findSituation(userId: string): Promise<AdvisorSituationRecord | null> {
    const row = await this.prisma.advisorSituation.findUnique({ where: { userId } })
    return row ? { text: row.text, updatedAt: row.updatedAt } : null
  }

  async saveSituation(userId: string, text: string): Promise<AdvisorSituationRecord> {
    const updatedAt = new Date()
    const [row] = await this.prisma.$transaction([
      this.prisma.advisorSituation.upsert({ where: { userId }, create: { userId, text, updatedAt }, update: { text, updatedAt } }),
      this.prisma.taxDataAccessLog.create({ data: { userId, action: 'WRITE', resource: 'berater_situation' } }),
    ])
    return { text: row.text, updatedAt: row.updatedAt }
  }

  async listNotes(userId: string, taxYear: number): Promise<AdvisorNoteRecord[]> {
    return (await this.prisma.advisorNote.findMany({ where: { userId, taxYear }, orderBy: { createdAt: 'asc' } })).map(toNote)
  }

  async findNote(id: string, userId: string): Promise<AdvisorNoteRecord | null> {
    const row = await this.prisma.advisorNote.findFirst({ where: { id, userId } })
    return row ? toNote(row) : null
  }

  async createNote(userId: string, taxYear: number, text: string, author: AdvisorNoteAuthor): Promise<AdvisorNoteRecord> {
    const [row] = await this.prisma.$transaction([
      this.prisma.advisorNote.create({ data: { userId, taxYear, text, author } }),
      this.prisma.taxDataAccessLog.create({ data: { userId, action: 'WRITE', resource: 'berater_notiz' } }),
    ])
    return toNote(row)
  }

  async updateNote(id: string, userId: string, text: string, author: AdvisorNoteAuthor): Promise<AdvisorNoteRecord | null> {
    const { count } = await this.prisma.advisorNote.updateMany({ where: { id, userId }, data: { text, author, updatedAt: new Date() } })
    return count === 1 ? this.findNote(id, userId) : null
  }

  async deleteNote(id: string, userId: string): Promise<boolean> {
    const { count } = await this.prisma.advisorNote.deleteMany({ where: { id, userId } })
    return count === 1
  }

  async deleteMessagesOfConversation(id: string, userId: string): Promise<number> {
    const [{ count }] = await this.prisma.$transaction([
      this.prisma.advisorChatMessage.deleteMany({ where: { conversationId: id, userId } }),
      this.prisma.taxDataAccessLog.create({ data: { userId, action: 'WRITE', resource: 'berater_nachricht_loeschen' } }),
    ])
    return count
  }

  async createMessage(input: CreateAdvisorMessageInput): Promise<AdvisorChatMessageRecord> {
    const conversationId = input.conversationId ?? (await this.defaultConversation(input.userId, input.taxYear)).id
    const [row] = await this.prisma.$transaction([
      this.prisma.advisorChatMessage.create({
        data: {
          conversationId,
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
      this.prisma.advisorConversation.deleteMany({ where: { userId, taxYear } }),
      this.prisma.taxDataAccessLog.create({
        data: { userId, action: 'WRITE', resource: 'berater_nachricht_loeschen' },
      }),
    ])
    return count
  }
}
