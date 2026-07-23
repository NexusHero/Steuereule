// Real-Postgres cascade (ADR-0004). Run via `pnpm --filter @steuereule/api
// test:integration` against a migrated database (`DATABASE_URL` set, migrations
// applied via `prisma migrate deploy`) — never the plain no-DB `pnpm -r test` job.
// Proves the same contract as cockpit.http.test.ts but through the real
// PrismaTaxYearRepository and the real unique-(userId, steuerjahr) constraint —
// REQ-001 (steuereule#91/#92): the endpoint reads real seeded rows end-to-end.
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

describe('GET /v1/steuerjahre/:jahr/cockpit — real Postgres (REQ-001)', () => {
  let app: NestFastifyApplication
  let prisma: PrismaClient

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
  })

  afterEach(async () => {
    await prisma.taxYear.deleteMany()
  })

  afterAll(async () => {
    await app.close()
  })

  it('REQ-001 GET with no seeded tax year returns 200 null — the honest empty state, not a 404', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/steuerjahre/2026/cockpit' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toBeNull()
  })

  it('REQ-001 returns the seeded row’s estimate range (computed via @steuereule/core’s cockpitRange) and open-items count', async () => {
    const first = await app.inject({ method: 'GET', url: '/v1/steuerjahre/2026/cockpit' })
    const cookie = extractSessionCookie(first.headers['set-cookie'])!
    const userId = userIdFromCookie(cookie)

    await prisma.taxYear.create({
      data: { userId, steuerjahr: 2026, baseEstimate: 1407, openItems: 3, openConflicts: 0 },
    })

    const response = await app.inject({
      method: 'GET',
      url: '/v1/steuerjahre/2026/cockpit',
      headers: { cookie },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      taxYear: 2026,
      estimate: { from: 1227, to: 1587 },
      openItems: 3,
    })
  })

  it('REQ-001 cross-userId isolation: userB never sees userA’s seeded tax year', async () => {
    const first = await app.inject({ method: 'GET', url: '/v1/steuerjahre/2026/cockpit' })
    const cookieA = extractSessionCookie(first.headers['set-cookie'])!
    const userIdA = userIdFromCookie(cookieA)

    await prisma.taxYear.create({
      data: { userId: userIdA, steuerjahr: 2026, baseEstimate: 1407, openItems: 3, openConflicts: 0 },
    })

    // A fresh request with no cookie is a brand-new guest session per the guard.
    const userBResponse = await app.inject({ method: 'GET', url: '/v1/steuerjahre/2026/cockpit' })
    expect(userBResponse.json()).toBeNull()

    const userAResponse = await app.inject({
      method: 'GET',
      url: '/v1/steuerjahre/2026/cockpit',
      headers: { cookie: cookieA },
    })
    expect(userAResponse.json()).toEqual({
      taxYear: 2026,
      estimate: { from: 1227, to: 1587 },
      openItems: 3,
    })
  })

  it('REQ-001 cross-steuerjahr isolation: a seeded 2026 row never answers for 2025', async () => {
    const first = await app.inject({ method: 'GET', url: '/v1/steuerjahre/2026/cockpit' })
    const cookie = extractSessionCookie(first.headers['set-cookie'])!
    const userId = userIdFromCookie(cookie)

    await prisma.taxYear.create({
      data: { userId, steuerjahr: 2026, baseEstimate: 1407, openItems: 3, openConflicts: 0 },
    })

    const response = await app.inject({
      method: 'GET',
      url: '/v1/steuerjahre/2025/cockpit',
      headers: { cookie },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toBeNull()
  })

  it('REQ-001 collapses to a point value once nothing is open (ADR-015), end-to-end through Postgres', async () => {
    const first = await app.inject({ method: 'GET', url: '/v1/steuerjahre/2026/cockpit' })
    const cookie = extractSessionCookie(first.headers['set-cookie'])!
    const userId = userIdFromCookie(cookie)

    await prisma.taxYear.create({
      data: { userId, steuerjahr: 2026, baseEstimate: 1444, openItems: 0, openConflicts: 0 },
    })

    const response = await app.inject({
      method: 'GET',
      url: '/v1/steuerjahre/2026/cockpit',
      headers: { cookie },
    })

    expect(response.json()).toEqual({ taxYear: 2026, estimate: { from: 1444, to: 1444 }, openItems: 0 })
  })
})
