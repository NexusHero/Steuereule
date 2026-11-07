import { randomUUID } from 'node:crypto'
import type { AdvisorMessageMeta } from '@steuereule/core'

export const ADVISOR_REPOSITORY = Symbol('ADVISOR_REPOSITORY')

export interface AdvisorChatMessageRecord {
  readonly id: string
  readonly userId: string
  readonly taxYear: number
  readonly role: 'user' | 'assistant'
  readonly content: string
  readonly meta: AdvisorMessageMeta | null
  readonly createdAt: Date
}

export interface CreateAdvisorMessageInput {
  readonly userId: string
  readonly taxYear: number
  readonly role: 'user' | 'assistant'
  readonly content: string
  readonly meta: AdvisorMessageMeta | null
}

export interface AdvisorRepository {
  listForUserAndYear(userId: string, taxYear: number): Promise<AdvisorChatMessageRecord[]>
  countUserMessagesSince(userId: string, since: Date): Promise<number>
  createMessage(input: CreateAdvisorMessageInput): Promise<AdvisorChatMessageRecord>
  findMessageByActionId(userId: string, taxYear: number, actionId: string): Promise<AdvisorChatMessageRecord | null>
  updateMessageMeta(id: string, userId: string, meta: AdvisorMessageMeta): Promise<AdvisorChatMessageRecord>
}

export function matchesActionId(meta: AdvisorMessageMeta | null, actionId: string): boolean {
  if (!meta) return false
  if (meta.action?.actionId === actionId) return true
  if (meta.twoPaths?.safePath.actionId === actionId) return true
  if (meta.twoPaths?.maxPath.actionId === actionId) return true
  return false
}

export class InMemoryAdvisorRepository implements AdvisorRepository {
  private readonly rows: AdvisorChatMessageRecord[] = []

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

  async updateMessageMeta(
    id: string,
    userId: string,
    meta: AdvisorMessageMeta,
  ): Promise<AdvisorChatMessageRecord> {
    const idx = this.rows.findIndex((r) => r.id === id && r.userId === userId)
    if (idx === -1) {
      throw new Error(`AdvisorChatMessage ${id} not found`)
    }
    const updated: AdvisorChatMessageRecord = {
      ...this.rows[idx]!,
      meta,
    }
    this.rows[idx] = updated
    return updated
  }
}
