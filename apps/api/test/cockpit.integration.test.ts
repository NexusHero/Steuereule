// Real-Postgres cascade (ADR-0004). Run via `pnpm --filter @steuereule/api
// test:integration` against a migrated database (`DATABASE_URL` set, migrations
// applied via `prisma migrate deploy`) — never the plain no-DB `pnpm -r test` job.
// Proves the same contract as cockpit.http.test.ts but through the real Prisma-backed
// repositories and the real unique-(userId, steuerjahr) constraint — REQ-001
// (steuereule#91/#92) + ticket 15 (Cockpit-Echtdaten): the endpoint reads real seeded rows
// end-to-end and returns the deterministic stand, never a baseEstimate.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import fastifyCookie from '@fastify/cookie'
import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module.js'
import { resolveGuestSessionSecret, verifyGuestSession } from '../src/auth/guest-session.js'
import { validationExceptionFactory } from '../src/common/validation-exception-factory.js'
import { PrismaService } from '../src/prisma/prisma.service.js'
import { INTERVIEW_ANSWER_REPOSITORY, type InterviewAnswerRepository } from '../src/interview/interview-answer.repository.js'
import { LSTB_REPOSITORY, type LstbRepository } from '../src/lstb/lstb.repository.js'
import { extractSessionCookie } from './support/build-test-app.js'

/** Recovers the trusted userId the app minted, from the raw `Set-Cookie`/`Cookie` pair. */
function userIdFromCookie(cookie: string): string {
  const rawValue = cookie.slice(cookie.indexOf('=') + 1)
  const userId = verifyGuestSession(decodeURIComponent(rawValue), resolveGuestSessionSecret())
  if (!userId) {
    throw new Error('test harness: could not recover userId from the session cookie')
  }
  return userId
}

describe('GET /v1/steuerjahre/:jahr/cockpit — real Postgres (REQ-001 + ticket 15)', () => {
  let app: NestFastifyApplication
  let prisma: PrismaClient
  let lstbRepository: LstbRepository
  let interviewRepository: InterviewAnswerRepository

  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
      logger: false,
    })
    await app.register(fastifyCookie)
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: validationExceptionFactory,
      }),
    )
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
    prisma = app.get(PrismaService)
    // The encryption-aware seams — the LStB/InterviewAnswer figures are field-encrypted at rest
    // (ADR-0008), so seeding them via raw Prisma would write plaintext the strict-mode read
    // would reject; the repositories' own upserts are the honest seeding paths.
    lstbRepository = app.get(LSTB_REPOSITORY)
    interviewRepository = app.get(INTERVIEW_ANSWER_REPOSITORY)
  })

  afterEach(async () => {
    await prisma.$executeRawUnsafe(`DELETE FROM "Lstb"`)
    await prisma.taxYear.deleteMany()
    await prisma.interviewAnswer.deleteMany()
  })

  afterAll(async () => {
    await app.close()
  })

  it('REQ-001 GET with no seeded tax year returns 200 null — the honest empty state, not a 404', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/steuerjahre/2026/cockpit' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toBeNull()
  })

  it('returns the deterministic stand from the settled LStB + open-items count (never a baseEstimate)', async () => {
    const first = await app.inject({ method: 'GET', url: '/v1/steuerjahre/2026/cockpit' })
    const cookie = extractSessionCookie(first.headers['set-cookie'])!
    const userId = userIdFromCookie(cookie)

    // Seed through the real seams: job=Angestellt (writes the TaxYear projection), then only the
    // Bruttoarbeitslohn — lohnsteuer + sozialversicherung stay open (honest, never a fabricated 0).
    await interviewRepository.write({ userId, steuerjahr: 2026, questionId: 'job', value: 'Angestellt', openItems: 2 })
    await lstbRepository.setFeld(userId, 2026, 'bruttoarbeitslohn', '50000')

    const response = await app.inject({
      method: 'GET',
      url: '/v1/steuerjahre/2026/cockpit',
      headers: { cookie },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      taxYear: 2026,
      // 2 open LStB fields × 60 uncertainty around the settled 50000.
      stand: { kind: 'spanne', von: 49880, bis: 50120, offenePosten: 2, konflikte: 0 },
      openItems: 2,
    })
  })

  it('REQ-001 cross-userId isolation: userB never sees userA’s seeded tax year', async () => {
    const first = await app.inject({ method: 'GET', url: '/v1/steuerjahre/2026/cockpit' })
    const cookieA = extractSessionCookie(first.headers['set-cookie'])!
    const userIdA = userIdFromCookie(cookieA)

    await interviewRepository.write({ userId: userIdA, steuerjahr: 2026, questionId: 'job', value: 'Angestellt', openItems: 2 })

    // A fresh request with no cookie is a brand-new guest session per the guard.
    const userBResponse = await app.inject({ method: 'GET', url: '/v1/steuerjahre/2026/cockpit' })
    expect(userBResponse.json()).toBeNull()

    const userAResponse = await app.inject({
      method: 'GET',
      url: '/v1/steuerjahre/2026/cockpit',
      headers: { cookie: cookieA },
    })
    // userA declared Angestellt but has not started the LStB yet → all three fields open.
    expect(userAResponse.json()).toEqual({
      taxYear: 2026,
      stand: { kind: 'spanne', von: 0, bis: 180, offenePosten: 3, konflikte: 0 },
      openItems: 2,
    })
  })

  it('REQ-001 cross-steuerjahr isolation: a seeded 2026 row never answers for 2025', async () => {
    const first = await app.inject({ method: 'GET', url: '/v1/steuerjahre/2026/cockpit' })
    const cookie = extractSessionCookie(first.headers['set-cookie'])!
    const userId = userIdFromCookie(cookie)

    await interviewRepository.write({ userId, steuerjahr: 2026, questionId: 'job', value: 'Angestellt', openItems: 2 })

    const response = await app.inject({
      method: 'GET',
      url: '/v1/steuerjahre/2025/cockpit',
      headers: { cookie },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toBeNull()
  })

  it('collapses to a point value once every LStB field is settled (ADR-015), end-to-end through Postgres', async () => {
    const first = await app.inject({ method: 'GET', url: '/v1/steuerjahre/2026/cockpit' })
    const cookie = extractSessionCookie(first.headers['set-cookie'])!
    const userId = userIdFromCookie(cookie)

    await interviewRepository.write({ userId, steuerjahr: 2026, questionId: 'job', value: 'Angestellt', openItems: 2 })
    await lstbRepository.setFeld(userId, 2026, 'bruttoarbeitslohn', '50000')
    await lstbRepository.setFeld(userId, 2026, 'lohnsteuer', '8000')
    await lstbRepository.setFeld(userId, 2026, 'sozialversicherung', '9000')

    const response = await app.inject({
      method: 'GET',
      url: '/v1/steuerjahre/2026/cockpit',
      headers: { cookie },
    })

    expect(response.json()).toEqual({ taxYear: 2026, stand: { kind: 'bestimmt', wert: 50000 }, openItems: 2 })
  })
})
