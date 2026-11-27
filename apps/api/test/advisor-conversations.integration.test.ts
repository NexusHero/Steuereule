// #481 against real Postgres: conversations in the encrypted store, the cascade on delete, and the
// order "used last first" that decides which conversation opens.
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ADVISOR_REPOSITORY, type AdvisorRepository } from '../src/advisor/advisor.repository.js'
import { AdvisorConversations } from '../src/advisor/advisor-conversations.js'
import { AdvisorService } from '../src/advisor/advisor.service.js'
import { AppModule } from '../src/app.module.js'
import { PrismaService } from '../src/prisma/prisma.service.js'
import { asDatabaseUser, fixtureClient } from './support/database-fixture.js'

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
    prisma = fixtureClient(app.get(PrismaService))
    // The repository and the service as the user's requests reach them (P11).
    repo = asDatabaseUser(userId, app.get<AdvisorRepository>(ADVISOR_REPOSITORY))
    service = asDatabaseUser(userId, app.get(AdvisorService))
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

  it('opens one first conversation when several requests ask for it at the same time (owl gate, 22.11.2026)', async () => {
    // A new user's owl loads the session and the conversation list and sends the first question at once: each
    // asks for the year's default conversation. They must all get the same one, or the answer lands in a
    // conversation the screen does not show.
    // Several fresh users in a row, so a lucky interleaving cannot hide the race.
    for (let round = 0; round < 10; round++) {
      const fresh = `${userId}-concurrent-${round}`
      try {
        const opened = await Promise.all(Array.from({ length: 12 }, () => asDatabaseUser(fresh, app.get<AdvisorRepository>(ADVISOR_REPOSITORY)).defaultConversation(fresh, YEAR)))
        expect(new Set(opened.map((conversation) => conversation.id)).size).toBe(1)
        expect(await asDatabaseUser(fresh, app.get<AdvisorRepository>(ADVISOR_REPOSITORY)).listConversations(fresh, YEAR)).toHaveLength(1)
      } finally {
        await prisma.advisorConversation.deleteMany({ where: { userId: fresh } })
      }
    }
  })

  it('stores the title encrypted and reads it back', async () => {
    const conversation = await repo.createConversation(userId, YEAR, 'Vermietung Musterweg')
    expect((await repo.findConversation(conversation.id, userId))?.title).toBe('Vermietung Musterweg')
    const [raw] = await prisma.$queryRawUnsafe<Array<{ titel: string }>>('SELECT "titel" FROM "BeraterGespraech" WHERE "id" = $1', conversation.id)
    expect(raw!.titel).not.toContain('Vermietung')
  })

  it('keeps when the owl last answered and when the user last looked, and reads unread from the two', async () => {
    const conversation = await repo.createConversation(userId, YEAR, 'Gelesen')
    expect(conversation.answeredAt).toBeNull()
    expect(conversation.readAt).toBeNull()
    const answered = new Date('2026-11-27T10:00:00.000Z')
    await repo.updateConversation(conversation.id, userId, { answeredAt: answered })
    expect((await repo.findConversation(conversation.id, userId))?.answeredAt).toEqual(answered)
    const conversations = asDatabaseUser(userId, app.get(AdvisorConversations))
    const unread = async () => (await conversations.listConversations(userId, YEAR)).find((c) => c.id === conversation.id)?.unread
    expect(await unread()).toBe(true)

    expect((await conversations.markRead(userId, YEAR, conversation.id)).unread).toBe(false)
    expect((await repo.findConversation(conversation.id, userId))?.readAt?.getTime()).toBeGreaterThan(answered.getTime())
    expect(await unread()).toBe(false)
  })

  it('keeps the chat model picked for a conversation, and the model of each answer in its usage (ADR-0096)', async () => {
    const conversation = await repo.createConversation(userId, YEAR, 'Modellwahl')
    await repo.updateConversation(conversation.id, userId, { chatModel: 'anthropic:claude-opus-5-5' })
    expect((await repo.findConversation(conversation.id, userId))?.chatModel).toBe('anthropic:claude-opus-5-5')
    await repo.updateConversation(conversation.id, userId, { chatModel: null })
    expect((await repo.findConversation(conversation.id, userId))?.chatModel).toBeNull()

    const answer = await repo.createMessage({ userId, taxYear: YEAR, role: 'assistant', content: '', meta: null, status: 'streaming', conversationId: conversation.id })
    await repo.finishMessage(answer.id, userId, { content: 'Ja.', status: 'complete', meta: null, reasoning: null, usage: { traceId: 'it', firstTokenMs: 900, durationMs: 1200, inputTokens: 10, outputTokens: 5, provider: 'anthropic', model: 'claude-opus-5-5', depth: 'max' } })
    expect(await repo.recentUsage(5)).toContainEqual(expect.objectContaining({ traceId: 'it', model: 'claude-opus-5-5', depth: 'max' }))
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
