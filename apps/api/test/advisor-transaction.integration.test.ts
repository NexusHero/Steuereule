// Real-Postgres proof (ADR-0004) for the Eulen-Modus unit of work: an apply-batch that fails
// midway leaves no field written, and a concurrent edit between stale check and write is
// rejected instead of silently overwritten. Unit tests use in-memory fakes, which cannot show
// either — only the real TransactionRunner, the transaction-aware encrypted client and the
// repositories' own `$transaction([...])` batches together can.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { AppModule } from '../src/app.module.js'
import { ADVISOR_REPOSITORY, type AdvisorRepository } from '../src/advisor/advisor.repository.js'
import { AdvisorService } from '../src/advisor/advisor.service.js'
import { COMMUTE_REPOSITORY, type CommuteRepository } from '../src/commute/commute.repository.js'
import { INTERVIEW_ANSWER_REPOSITORY, type InterviewAnswerRepository } from '../src/interview/interview-answer.repository.js'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../src/prisma/encrypted-prisma.provider.js'
import { PrismaService } from '../src/prisma/prisma.service.js'
import { TRANSACTION_RUNNER, type TransactionRunner } from '../src/prisma/transaction.js'

const YEAR = 2025

describe('Eulen-Modus unit of work — real Postgres', () => {
  let app: NestFastifyApplication
  let prisma: PrismaService
  let encrypted: EncryptedPrismaClient
  let runner: TransactionRunner
  let advisor: AdvisorService
  let advisorRepo: AdvisorRepository
  let interviewRepo: InterviewAnswerRepository
  let commuteRepo: CommuteRepository
  const userIds: string[] = []

  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), { logger: false })
    await app.init()
    prisma = app.get(PrismaService)
    encrypted = app.get(ENCRYPTED_PRISMA)
    runner = app.get(TRANSACTION_RUNNER)
    advisor = app.get(AdvisorService)
    advisorRepo = app.get(ADVISOR_REPOSITORY)
    interviewRepo = app.get(INTERVIEW_ANSWER_REPOSITORY)
    commuteRepo = app.get(COMMUTE_REPOSITORY)
  })

  afterEach(async () => {
    for (const userId of userIds.splice(0)) {
      await prisma.interviewAnswer.deleteMany({ where: { userId } })
      await prisma.marking.deleteMany({ where: { userId } })
      await prisma.taxDataAccessLog.deleteMany({ where: { userId } })
      await prisma.taxYear.deleteMany({ where: { userId } })
      await prisma.advisorChatMessage.deleteMany({ where: { userId } })
      await prisma.commute.deleteMany({ where: { userId } })
    }
  })

  afterAll(async () => {
    await app.close()
  })

  function newUser(): string {
    const userId = `tx-${randomUUID()}`
    userIds.push(userId)
    return userId
  }

  it('rolls back every field of a batch when a later draft fails mid-commit', async () => {
    const userId = newUser()
    await commuteRepo.save(userId, YEAR, {
      workdays: [1, 2, 3, 4, 5],
      vacationDays: 0,
      sickDays: 0,
      homeOfficeDays: 0,
      oneWayKm: 12,
      transport: null,
      workplace: null,
    })
    await advisorRepo.createMessage({
      userId,
      taxYear: YEAR,
      role: 'assistant',
      content: 'Zwei Entwürfe',
      meta: {
        action: {
          actionId: 'act-ok',
          status: 'pending',
          screen: 'interview',
          field: 'spenden-betrag',
          instance: null,
          companionFields: { spenden: 'Ja' },
          companionExpectedValues: { spenden: null },
          label: 'Spenden',
          previousValue: null,
          expectedPreviousValue: null,
          newValue: '300',
          beforeRefundEur: 0,
          afterRefundEur: 0,
          deltaEur: 0,
          reason: 'Test',
          sourceId: 'estg-10b',
        },
      },
    })
    await advisorRepo.createMessage({
      userId,
      taxYear: YEAR,
      role: 'assistant',
      content: 'Kaputter Entwurf',
      meta: {
        action: {
          actionId: 'act-broken',
          status: 'pending',
          screen: 'commute',
          field: 'oneWayKm',
          instance: null,
          label: 'Arbeitsweg',
          previousValue: null,
          expectedPreviousValue: '12',
          // Passes the stale check, then fails field validation — after the first draft was already written.
          newValue: 'keine Zahl',
          beforeRefundEur: 0,
          afterRefundEur: 0,
          deltaEur: 0,
          reason: 'Test',
          sourceId: 'estg-9-1',
        },
      },
    })

    await expect(
      advisor.applyBatch(userId, YEAR, { drafts: [{ actionId: 'act-ok' }, { actionId: 'act-broken' }] }),
    ).rejects.toMatchObject({ code: 'FIELD_VALUE_INVALID' })

    expect(await prisma.interviewAnswer.count({ where: { userId } })).toBe(0)
    expect(await prisma.marking.count({ where: { userId } })).toBe(0)
    const stored = await advisorRepo.findMessageByActionId(userId, YEAR, 'act-ok')
    expect(stored?.meta?.action?.status).toBe('pending')
  })

  it('applies a batch through the repositories’ own batched writes and commits it as a whole', async () => {
    const userId = newUser()
    await advisorRepo.createMessage({
      userId,
      taxYear: YEAR,
      role: 'assistant',
      content: 'Spenden',
      meta: {
        action: {
          actionId: 'act-commit',
          status: 'pending',
          screen: 'interview',
          field: 'spenden-betrag',
          instance: null,
          companionFields: { spenden: 'Ja' },
          companionExpectedValues: { spenden: null },
          label: 'Spenden',
          previousValue: null,
          expectedPreviousValue: null,
          newValue: '300',
          beforeRefundEur: 0,
          afterRefundEur: 0,
          deltaEur: 0,
          reason: 'Test',
          sourceId: 'estg-10b',
        },
      },
    })

    const result = await advisor.applyBatch(userId, YEAR, { drafts: [{ actionId: 'act-commit' }] })
    expect(result.actions[0]?.status).toBe('applied')
    const answers = await interviewRepo.findAllForUserAndYear(userId, YEAR)
    expect(answers.find((a) => a.questionId === 'spenden-betrag')?.value).toBe('300')
    expect(answers.find((a) => a.questionId === 'spenden')?.value).toBe('Ja')
  })

  it('turns a concurrent edit between read and write into a conflict instead of a lost update', async () => {
    const userId = newUser()
    await interviewRepo.write({ userId, taxYear: YEAR, questionId: 'spenden-betrag', value: '100', openItems: 0 })

    const attempt = runner.run(async () => {
      const seen = await encrypted.interviewAnswer.findFirst({ where: { userId, taxYear: YEAR, questionId: 'spenden-betrag' } })
      expect(seen?.value).toBe('100')
      // A manual mask edit commits on its own connection while our transaction is still open.
      await prisma.interviewAnswer.updateMany({ where: { userId, taxYear: YEAR, questionId: 'spenden-betrag' }, data: { value: '180' } })
      await encrypted.interviewAnswer.updateMany({
        where: { userId, taxYear: YEAR, questionId: 'spenden-betrag' },
        data: { value: '300' },
      })
    })

    await expect(attempt).rejects.toMatchObject({ code: 'CONCURRENT_WRITE_CONFLICT' })
  })
})
