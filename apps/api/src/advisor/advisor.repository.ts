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

/** One conversation with the owl inside the project of a tax year (#481). */
export interface AdvisorConversationRecord {
  readonly id: string
  readonly userId: string
  readonly taxYear: number
  /** Null until the first question has been asked. */
  readonly title: string | null
  readonly createdAt: Date
  readonly lastUsedAt: Date
  /** What the conversation said up to `summaryUntil`; the model reads this instead of those messages. */
  readonly summary: string | null
  readonly summaryUntil: Date | null
}

export type AdvisorNoteAuthor = 'owl' | 'user'

/** A project note of one tax year (#481). */
export interface AdvisorNoteRecord {
  readonly id: string
  readonly userId: string
  readonly taxYear: number
  readonly text: string
  readonly author: AdvisorNoteAuthor
  readonly createdAt: Date
  readonly updatedAt: Date
}

/** What may change on a conversation after it was created. */
export interface AdvisorConversationChange {
  readonly title?: string | null
  readonly lastUsedAt?: Date
  readonly summary?: string | null
  readonly summaryUntil?: Date | null
}

export interface AdvisorChatMessageRecord {
  readonly id: string
  readonly userId: string
  readonly taxYear: number
  readonly conversationId: string
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
  /** Defaults to the conversation of that year used last (created when there is none). */
  readonly conversationId?: string | undefined
}

/** The final state of an answer that was created as `streaming`. */
export interface FinishAdvisorMessageInput {
  readonly content: string
  readonly meta: AdvisorMessageMeta | null
  readonly status: Exclude<AdvisorMessageStatus, 'streaming'>
  readonly reasoning: string | null
  readonly usage: AdvisorMessageUsage | null
}

export interface AdvisorSituationRecord {
  readonly text: string
  readonly updatedAt: Date
}

export interface AdvisorRepository {
  /** Every message of the year, across all its conversations: drafts belong to the return. */
  listForUserAndYear(userId: string, taxYear: number): Promise<AdvisorChatMessageRecord[]>
  /** The messages of one conversation, oldest first. */
  listForConversation(conversationId: string, userId: string): Promise<AdvisorChatMessageRecord[]>
  /** Most recently used first. */
  listConversations(userId: string, taxYear: number): Promise<AdvisorConversationRecord[]>
  /** Null when the conversation does not exist or belongs to someone else. */
  findConversation(id: string, userId: string): Promise<AdvisorConversationRecord | null>
  createConversation(userId: string, taxYear: number, title?: string | null): Promise<AdvisorConversationRecord>
  /** The conversation of that year used last; created when the year has none yet. */
  defaultConversation(userId: string, taxYear: number): Promise<AdvisorConversationRecord>
  /** Null when the conversation does not exist or belongs to someone else. */
  updateConversation(id: string, userId: string, change: AdvisorConversationChange): Promise<AdvisorConversationRecord | null>
  /** Deletes the conversation with its messages; returns how many messages went, null when not found. */
  deleteConversation(id: string, userId: string): Promise<number | null>
  /** Empties one conversation and keeps it; returns how many messages went. */
  deleteMessagesOfConversation(id: string, userId: string): Promise<number>
  /** The project notes of a tax year, oldest first. */
  /** The user's own description of the situation; null while nothing was written (#501). */
  findSituation(userId: string): Promise<AdvisorSituationRecord | null>
  saveSituation(userId: string, text: string): Promise<AdvisorSituationRecord>
  listNotes(userId: string, taxYear: number): Promise<AdvisorNoteRecord[]>
  findNote(id: string, userId: string): Promise<AdvisorNoteRecord | null>
  createNote(userId: string, taxYear: number, text: string, author: AdvisorNoteAuthor): Promise<AdvisorNoteRecord>
  /** Null when the note does not exist or belongs to someone else. */
  updateNote(id: string, userId: string, text: string, author: AdvisorNoteAuthor): Promise<AdvisorNoteRecord | null>
  /** False when the note does not exist or belongs to someone else. */
  deleteNote(id: string, userId: string): Promise<boolean>
  countUserMessagesSince(userId: string, since: Date): Promise<number>
  createMessage(input: CreateAdvisorMessageInput): Promise<AdvisorChatMessageRecord>
  findMessageByActionId(userId: string, taxYear: number, actionId: string): Promise<AdvisorChatMessageRecord | null>
  updateMessageMeta(id: string, userId: string, meta: AdvisorMessageMeta): Promise<AdvisorChatMessageRecord>
  /** Null when the message does not exist or belongs to someone else. */
  findMessage(id: string, userId: string): Promise<AdvisorChatMessageRecord | null>
  finishMessage(id: string, userId: string, input: FinishAdvisorMessageInput): Promise<AdvisorChatMessageRecord>
  /** Null when the message does not exist or belongs to someone else. */
  setFeedback(id: string, userId: string, feedback: AdvisorMessageFeedback | null): Promise<AdvisorChatMessageRecord | null>
  /** Deletes every conversation of one tax year; returns how many messages went. */
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
  private conversations: AdvisorConversationRecord[] = []
  /** Keeps "used last" stable for conversations touched within the same millisecond. */
  private clock = 0

  private now(): Date {
    this.clock = Math.max(this.clock + 1, Date.now())
    return new Date(this.clock)
  }

  async listForConversation(conversationId: string, userId: string): Promise<AdvisorChatMessageRecord[]> {
    return this.rows
      .filter((r) => r.conversationId === conversationId && r.userId === userId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  }

  async listConversations(userId: string, taxYear: number): Promise<AdvisorConversationRecord[]> {
    return this.conversations
      .filter((c) => c.userId === userId && c.taxYear === taxYear)
      .sort((a, b) => b.lastUsedAt.getTime() - a.lastUsedAt.getTime())
  }

  async findConversation(id: string, userId: string): Promise<AdvisorConversationRecord | null> {
    return this.conversations.find((c) => c.id === id && c.userId === userId) ?? null
  }

  async createConversation(userId: string, taxYear: number, title: string | null = null): Promise<AdvisorConversationRecord> {
    const at = this.now()
    const conversation: AdvisorConversationRecord = { id: randomUUID(), userId, taxYear, title, createdAt: at, lastUsedAt: at, summary: null, summaryUntil: null }
    this.conversations.push(conversation)
    return conversation
  }

  async defaultConversation(userId: string, taxYear: number): Promise<AdvisorConversationRecord> {
    return (await this.listConversations(userId, taxYear))[0] ?? this.createConversation(userId, taxYear)
  }

  async updateConversation(id: string, userId: string, change: AdvisorConversationChange): Promise<AdvisorConversationRecord | null> {
    const index = this.conversations.findIndex((c) => c.id === id && c.userId === userId)
    if (index === -1) return null
    // Two touches within one millisecond still need an order; the in-memory clock never repeats.
    const updated = { ...this.conversations[index]!, ...change, ...(change.lastUsedAt ? { lastUsedAt: this.now() } : {}) }
    this.conversations[index] = updated
    return updated
  }

  async deleteConversation(id: string, userId: string): Promise<number | null> {
    if (!(await this.findConversation(id, userId))) return null
    const deleted = await this.deleteMessagesOfConversation(id, userId)
    this.conversations = this.conversations.filter((c) => c.id !== id)
    return deleted
  }

  private situations = new Map<string, AdvisorSituationRecord>()

  async findSituation(userId: string): Promise<AdvisorSituationRecord | null> {
    return this.situations.get(userId) ?? null
  }

  async saveSituation(userId: string, text: string): Promise<AdvisorSituationRecord> {
    const record = { text, updatedAt: this.now() }
    this.situations.set(userId, record)
    return record
  }

  private notes: AdvisorNoteRecord[] = []

  async listNotes(userId: string, taxYear: number): Promise<AdvisorNoteRecord[]> {
    return this.notes.filter((n) => n.userId === userId && n.taxYear === taxYear).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  }

  async findNote(id: string, userId: string): Promise<AdvisorNoteRecord | null> {
    return this.notes.find((n) => n.id === id && n.userId === userId) ?? null
  }

  async createNote(userId: string, taxYear: number, text: string, author: AdvisorNoteAuthor): Promise<AdvisorNoteRecord> {
    const at = this.now()
    const note: AdvisorNoteRecord = { id: randomUUID(), userId, taxYear, text, author, createdAt: at, updatedAt: at }
    this.notes.push(note)
    return note
  }

  async updateNote(id: string, userId: string, text: string, author: AdvisorNoteAuthor): Promise<AdvisorNoteRecord | null> {
    const index = this.notes.findIndex((n) => n.id === id && n.userId === userId)
    if (index === -1) return null
    const updated = { ...this.notes[index]!, text, author, updatedAt: this.now() }
    this.notes[index] = updated
    return updated
  }

  async deleteNote(id: string, userId: string): Promise<boolean> {
    const before = this.notes.length
    this.notes = this.notes.filter((n) => !(n.id === id && n.userId === userId))
    return this.notes.length < before
  }

  async deleteMessagesOfConversation(id: string, userId: string): Promise<number> {
    const before = this.rows.length
    this.rows = this.rows.filter((r) => !(r.conversationId === id && r.userId === userId))
    return before - this.rows.length
  }

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
    const conversationId = input.conversationId ?? (await this.defaultConversation(input.userId, input.taxYear)).id
    const record: AdvisorChatMessageRecord = {
      id: randomUUID(),
      userId: input.userId,
      taxYear: input.taxYear,
      conversationId,
      role: input.role,
      content: input.content,
      meta: input.meta,
      // Never two messages at the same instant: the summary boundary is a point in time.
      createdAt: this.now(),
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
    this.conversations = this.conversations.filter((c) => !(c.userId === userId && c.taxYear === taxYear))
    return before - this.rows.length
  }
}
