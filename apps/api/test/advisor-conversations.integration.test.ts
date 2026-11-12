// #481 against real Postgres: conversations in the encrypted store, the cascade on delete, and the
// order "used last first" that decides which conversation opens.
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ADVISOR_REPOSITORY, type AdvisorRepository } from '../src/advisor/advisor.repository.js'
import { AdvisorService } from '../src/advisor/advisor.service.js'
import { AppModule } from '../src/app.module.js'
import { PrismaService } from '../src/prisma/prisma.service.js'

const YEAR = 2025

describe('conversations in the database (#481)', () => {
  let app: NestFastifyApplication
  let prisma: PrismaService
  let repo: AdvisorRepository
  let service: AdvisorService
  const userId = `it-conversations-${randomUUID()}`

  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), { logger: false })
    await app.init()
    prisma = app.get(PrismaService)
    repo = app.get<AdvisorRepository>(ADVISOR_REPOSITORY)
    service = app.get(AdvisorService)
  })

  afterAll(async () => {
    await prisma.advisorChatMessage.deleteMany({ where: { userId } })
    await prisma.advisorConversation.deleteMany({ where: { userId } })
    await prisma.taxDataAccessLog.deleteMany({ where: { userId } })
    await app.close()
  })

  it('creates the first conversation of a year on demand, once', async () => {
    const first = await repo.defaultConversation(userId, YEAR)
    const again = await repo.defaultConversation(userId, YEAR)
    expect(again.id).toBe(first.id)
    expect(await repo.listConversations(userId, YEAR)).toHaveLength(1)
  })

  it('stores the title encrypted and reads it back', async () => {
    const conversation = await repo.createConversation(userId, YEAR, 'Vermietung Musterweg')
    expect((await repo.findConversation(conversation.id, userId))?.title).toBe('Vermietung Musterweg')
    const [raw] = await prisma.$queryRawUnsafe<Array<{ titel: string }>>('SELECT "titel" FROM "BeraterGespraech" WHERE "id" = $1', conversation.id)
    expect(raw!.titel).not.toContain('Vermietung')
  })

  it('files a message without a conversation under the one used last', async () => {
    const used = await repo.createConversation(userId, YEAR, 'Zuletzt benutzt')
    await repo.updateConversation(used.id, userId, { lastUsedAt: new Date(Date.now() + 60_000) })
    const message = await repo.createMessage({ userId, taxYear: YEAR, role: 'user', content: 'Hallo', meta: null })
    expect(message.conversationId).toBe(used.id)
    expect((await repo.listForConversation(used.id, userId)).map((m) => m.content)).toEqual(['Hallo'])
  })

  it('lists the conversations with the one used last first, and the session opens that one', async () => {
    const [latest] = await repo.listConversations(userId, YEAR)
    expect(latest!.title).toBe('Zuletzt benutzt')
    expect((await service.getSession(userId, YEAR)).conversationId).toBe(latest!.id)
  })

  it('deletes a conversation together with its messages, and nobody else\'s', async () => {
    const mine = await repo.createConversation(userId, YEAR, 'Wird gelöscht')
    await repo.createMessage({ userId, taxYear: YEAR, conversationId: mine.id, role: 'user', content: 'weg', meta: null })
    expect(await repo.deleteConversation(mine.id, 'someone-else')).toBeNull()
    expect(await repo.deleteConversation(mine.id, userId)).toBe(1)
    expect(await repo.findConversation(mine.id, userId)).toBeNull()
    expect(await prisma.advisorChatMessage.count({ where: { conversationId: mine.id } })).toBe(0)
  })

  it('keeps every message of the year reachable for drafts, whichever conversation holds it', async () => {
    const all = await repo.listForUserAndYear(userId, YEAR)
    expect(all.map((m) => m.content)).toContain('Hallo')
    expect(all.every((m) => m.conversationId !== '')).toBe(true)
  })
})
