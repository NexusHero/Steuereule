import { Inject, Injectable } from '@nestjs/common'
import type { AdvisorMessageMeta } from '@steuereule/core'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import {
  matchesActionId,
  type AdvisorChatMessageRecord,
  type AdvisorRepository,
  type CreateAdvisorMessageInput,
} from './advisor.repository.js'

function parseMeta(metaJson: string | null): AdvisorMessageMeta | null {
  if (!metaJson) return null
  try {
    return JSON.parse(metaJson) as AdvisorMessageMeta
  } catch {
    return null
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
}): AdvisorChatMessageRecord {
  return {
    id: row.id,
    userId: row.userId,
    taxYear: row.taxYear,
    role: row.role === 'user' ? 'user' : 'assistant',
    content: row.content,
    meta: parseMeta(row.metaJson),
    createdAt: row.createdAt,
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
}
