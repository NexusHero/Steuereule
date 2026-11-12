import { randomUUID } from 'node:crypto'
import type { AdvisorMessageFeedback, AdvisorMessageMeta, AdvisorMessageStatus, AdvisorTurnUsage } from '@steuereule/core'

export const ADVISOR_REPOSITORY = Symbol('ADVISOR_REPOSITORY')

/** What a turn cost and how long it took (#476). Carries no message content. */
export interface AdvisorMessageUsage extends Partial<AdvisorTurnUsage> {
  readonly traceId: string
  /** Milliseconds from the start of the turn to the first answer token; null if none arrived. */
  readonly firstTokenMs: number | null
  readonly durationMs: number
}

export interface AdvisorChatMessageRecord {
  readonly id: string
  readonly userId: string
  readonly taxYear: number
  readonly role: 'user' | 'assistant'
  readonly content: string
  readonly meta: AdvisorMessageMeta | null
  readonly createdAt: Date
  readonly status: AdvisorMessageStatus
  readonly reasoning: string | null
  readonly runId: string | null
  readonly feedback: AdvisorMessageFeedback | null
  readonly usage: AdvisorMessageUsage | null
}

export interface CreateAdvisorMessageInput {
  readonly userId: string
  readonly taxYear: number
  readonly role: 'user' | 'assistant'
  readonly content: string
  readonly meta: AdvisorMessageMeta | null
  /** Defaults to `complete`. */
  readonly status?: AdvisorMessageStatus | undefined
  readonly runId?: string | undefined
}

/** The final state of an answer that was created as `streaming`. */
export interface FinishAdvisorMessageInput {
  readonly content: string
  readonly meta: AdvisorMessageMeta | null
  readonly status: Exclude<AdvisorMessageStatus, 'streaming'>
  readonly reasoning: string | null
  readonly usage: AdvisorMessageUsage | null
}

export interface AdvisorRepository {
  listForUserAndYear(userId: string, taxYear: number): Promise<AdvisorChatMessageRecord[]>
  countUserMessagesSince(userId: string, since: Date): Promise<number>
  createMessage(input: CreateAdvisorMessageInput): Promise<AdvisorChatMessageRecord>
  findMessageByActionId(userId: string, taxYear: number, actionId: string): Promise<AdvisorChatMessageRecord | null>
  updateMessageMeta(id: string, userId: string, meta: AdvisorMessageMeta): Promise<AdvisorChatMessageRecord>
  /** Null when the message does not exist or belongs to someone else. */
  findMessage(id: string, userId: string): Promise<AdvisorChatMessageRecord | null>
  finishMessage(id: string, userId: string, input: FinishAdvisorMessageInput): Promise<AdvisorChatMessageRecord>
  /** Null when the message does not exist or belongs to someone else. */
  setFeedback(id: string, userId: string, feedback: AdvisorMessageFeedback | null): Promise<AdvisorChatMessageRecord | null>
  /** Deletes the whole conversation of one tax year; returns how many messages went. */
  deleteForUserAndYear(userId: string, taxYear: number): Promise<number>
}

export function matchesActionId(meta: AdvisorMessageMeta | null, actionId: string): boolean {
  if (!meta) return false
  if (meta.action?.actionId === actionId) return true
  if (meta.actions?.some((a) => a.actionId === actionId)) return true
  if (meta.twoPaths?.safePath.actionId === actionId) return true
  if (meta.twoPaths?.maxPath.actionId === actionId) return true
  return false
}

export class InMemoryAdvisorRepository implements AdvisorRepository {
  private rows: AdvisorChatMessageRecord[] = []

  async listForUserAndYear(userId: string, taxYear: number): Promise<AdvisorChatMessageRecord[]> {
    return this.rows
      .filter((r) => r.userId === userId && r.taxYear === taxYear)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  }

  async countUserMessagesSince(userId: string, since: Date): Promise<number> {
    return this.rows.filter(
      (r) => r.userId === userId && r.role === 'user' && r.createdAt.getTime() >= since.getTime(),
    ).length
  }

  async createMessage(input: CreateAdvisorMessageInput): Promise<AdvisorChatMessageRecord> {
    const record: AdvisorChatMessageRecord = {
      id: randomUUID(),
      userId: input.userId,
      taxYear: input.taxYear,
      role: input.role,
      content: input.content,
      meta: input.meta,
      createdAt: new Date(),
      status: input.status ?? 'complete',
      reasoning: null,
      runId: input.runId ?? null,
      feedback: null,
      usage: null,
    }
    this.rows.push(record)
    return record
  }

  async findMessageByActionId(
    userId: string,
    taxYear: number,
    actionId: string,
  ): Promise<AdvisorChatMessageRecord | null> {
    const found = this.rows.find(
      (r) => r.userId === userId && r.taxYear === taxYear && matchesActionId(r.meta, actionId),
    )
    return found ?? null
  }

  private patch(id: string, userId: string, change: Partial<AdvisorChatMessageRecord>): AdvisorChatMessageRecord | null {
    const idx = this.rows.findIndex((r) => r.id === id && r.userId === userId)
    if (idx === -1) return null
    const updated: AdvisorChatMessageRecord = { ...this.rows[idx]!, ...change }
    this.rows[idx] = updated
    return updated
  }

  async updateMessageMeta(
    id: string,
    userId: string,
    meta: AdvisorMessageMeta,
  ): Promise<AdvisorChatMessageRecord> {
    const updated = this.patch(id, userId, { meta })
    if (!updated) throw new Error(`AdvisorChatMessage ${id} not found`)
    return updated
  }

  async findMessage(id: string, userId: string): Promise<AdvisorChatMessageRecord | null> {
    return this.rows.find((r) => r.id === id && r.userId === userId) ?? null
  }

  async finishMessage(id: string, userId: string, input: FinishAdvisorMessageInput): Promise<AdvisorChatMessageRecord> {
    const updated = this.patch(id, userId, { ...input, runId: null })
    if (!updated) throw new Error(`AdvisorChatMessage ${id} not found`)
    return updated
  }

  async setFeedback(id: string, userId: string, feedback: AdvisorMessageFeedback | null): Promise<AdvisorChatMessageRecord | null> {
    return this.patch(id, userId, { feedback })
  }

  async deleteForUserAndYear(userId: string, taxYear: number): Promise<number> {
    const before = this.rows.length
    this.rows = this.rows.filter((r) => !(r.userId === userId && r.taxYear === taxYear))
    return before - this.rows.length
  }
}
