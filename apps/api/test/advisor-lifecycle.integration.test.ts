// Real-Postgres proof (ADR-0004) for #476: the lifecycle columns exist after the migration, the
// reasoning summary is encrypted at rest, feedback and clearing are scoped to their owner.
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module.js'
import { ADVISOR_REPOSITORY, type AdvisorRepository } from '../src/advisor/advisor.repository.js'
import { PrismaService } from '../src/prisma/prisma.service.js'

const YEAR = 2025

describe('Advisor message lifecycle — real Postgres (#476)', () => {
  let app: NestFastifyApplication
  let prisma: PrismaService
  let repo: AdvisorRepository
  const userIds: string[] = []

  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), { logger: false })
    await app.init()
    prisma = app.get(PrismaService)
    repo = app.get(ADVISOR_REPOSITORY)
  })

  afterEach(async () => {
    for (const userId of userIds.splice(0)) {
      await prisma.taxDataAccessLog.deleteMany({ where: { userId } })
      await prisma.advisorChatMessage.deleteMany({ where: { userId } })
    }
  })

  afterAll(async () => {
    await app.close()
  })

  function newUser(): string {
    const id = `it-476-${randomUUID()}`
    userIds.push(id)
    return id
  }

  it('reads a row written before the migration as complete, without reasoning or rating', async () => {
    const userId = newUser()
    const legacy = await repo.createMessage({ userId, taxYear: YEAR, role: 'assistant', content: 'alt', meta: null })
    expect(legacy).toMatchObject({ status: 'complete', reasoning: null, runId: null, feedback: null, usage: null })
  })

  it('takes an answer from streaming to its final state and stores the reasoning encrypted', async () => {
    const userId = newUser()
    const streaming = await repo.createMessage({
      userId, taxYear: YEAR, role: 'assistant', content: '', meta: null, status: 'streaming', runId: 'run-it-1',
    })
    expect(streaming).toMatchObject({ status: 'streaming', runId: 'run-it-1' })

    const finished = await repo.finishMessage(streaming.id, userId, {
      content: 'Fertige Antwort',
      meta: { steps: ['Prüfe EStG-Paragraph …'] },
      status: 'complete',
      reasoning: 'Erst die Pauschale prüfen.',
      usage: { traceId: 'run-it-1', firstTokenMs: 120, durationMs: 900, inputTokens: 1000, outputTokens: 50, cachedInputTokens: 800 },
    })
    expect(finished).toMatchObject({
      status: 'complete', runId: null, content: 'Fertige Antwort', reasoning: 'Erst die Pauschale prüfen.',
      usage: { traceId: 'run-it-1', inputTokens: 1000, cachedInputTokens: 800 },
    })
    expect(finished.meta?.steps).toEqual(['Prüfe EStG-Paragraph …'])

    // Read past the encryption layer: neither the answer nor the reasoning is stored in the clear.
    const raw = await prisma.$queryRaw<Array<{ inhalt: string; gedankengang: string; verbrauch: string }>>`
      SELECT "inhalt", "gedankengang", "verbrauch" FROM "BeraterNachricht" WHERE "id" = ${streaming.id}`
    expect(raw[0]!.gedankengang).not.toContain('Pauschale')
    expect(raw[0]!.inhalt).not.toContain('Fertige')
    // Usage is operational data without content and stays readable.
    expect(JSON.parse(raw[0]!.verbrauch)).toMatchObject({ traceId: 'run-it-1' })
  })

  it('refuses to finish, rate or find a message through someone else’s id', async () => {
    const owner = newUser()
    const stranger = newUser()
    const message = await repo.createMessage({ userId: owner, taxYear: YEAR, role: 'assistant', content: 'x', meta: null, status: 'streaming', runId: 'r' })

    await expect(
      repo.finishMessage(message.id, stranger, { content: 'gekapert', meta: null, status: 'complete', reasoning: null, usage: null }),
    ).rejects.toThrow()
    expect(await repo.setFeedback(message.id, stranger, { rating: 'down' })).toBeNull()
    expect(await repo.findMessage(message.id, stranger)).toBeNull()
    expect(await repo.findMessage(message.id, owner)).toMatchObject({ content: 'x', status: 'streaming', feedback: null })
  })

  it('stores, changes and removes a rating', async () => {
    const userId = newUser()
    const message = await repo.createMessage({ userId, taxYear: YEAR, role: 'assistant', content: 'x', meta: null })
    expect((await repo.setFeedback(message.id, userId, { rating: 'down', reason: 'unklar' }))?.feedback).toEqual({ rating: 'down', reason: 'unklar' })
    expect((await repo.setFeedback(message.id, userId, { rating: 'up' }))?.feedback).toEqual({ rating: 'up' })
    expect((await repo.setFeedback(message.id, userId, null))?.feedback).toBeNull()
  })

  it('deletes one year of one user and leaves a trace in the access log', async () => {
    const userId = newUser()
    const other = newUser()
    await repo.createMessage({ userId, taxYear: YEAR, role: 'user', content: 'a', meta: null })
    await repo.createMessage({ userId, taxYear: YEAR, role: 'assistant', content: 'b', meta: null })
    await repo.createMessage({ userId, taxYear: YEAR - 1, role: 'user', content: 'c', meta: null })
    await repo.createMessage({ userId: other, taxYear: YEAR, role: 'user', content: 'd', meta: null })

    expect(await repo.deleteForUserAndYear(userId, YEAR)).toBe(2)
    expect(await repo.listForUserAndYear(userId, YEAR)).toHaveLength(0)
    expect(await repo.listForUserAndYear(userId, YEAR - 1)).toHaveLength(1)
    expect(await repo.listForUserAndYear(other, YEAR)).toHaveLength(1)
    const log = await prisma.taxDataAccessLog.findMany({ where: { userId, resource: 'berater_nachricht_loeschen' } })
    expect(log).toHaveLength(1)
  })
})
