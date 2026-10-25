// REQ-027 — the Fristen-/Verspätungszuschlag-Warnmodus (M6, ticket 10.7). Real Postgres, real
// HTTP against the actual `buildApp()` boot (never `.inject()`) — the acceptance tier the
// register's `Done` binds to (Musti's #249 R2 ruling).
//
// Covers the ticket's core: the Abgabefrist comes from the per-year § 149 Abs. 2 AO Regelwerk
// (never "current" values, ADR-022); the response is the honest Fristen-Fakt (ADR-0039) — a
// banner input (`keine`/`warnung`/`abgelaufen`), never a tax status, the Steuerjahr stays
// `entwurf`; `heute` is the server's Europe/Berlin date (never the client clock); the
// § 152 Abs. 2 AO figures are cited. An unsupported year is an honest 400 at the boundary.
// The stufen-derivation itself is pinned kern-pur (packages/core/src/fristen.test.ts) because
// it depends on the real server date; here the response must be SELF-CONSISTENT with the
// returned `heute`.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { resetRateLimiters } from '../support/reset-rate-limiters.js'

process.env.GUEST_SESSION_SECRET = 'req-027-secret'
process.env.BETTER_AUTH_SECRET = 'req-027-better-auth-secret-0123456789'
process.env.BETTER_AUTH_URL = 'http://127.0.0.1:39997'

const ALLOWED_ORIGIN = 'https://allowed.example.com'
process.env.CORS_ALLOWED_ORIGINS = ALLOWED_ORIGIN
const TRUSTED_ORIGIN_HEADERS = { origin: ALLOWED_ORIGIN }

const STEUERJAHR = 2026

describe('REQ-027 — the Fristen-Warnmodus (§ 149/§ 152 AO), against the real server', () => {
  let app: NestFastifyApplication
  let baseUrl: string
  let prisma: PrismaClient

  beforeAll(async () => {
    const { buildApp } = await import('../../src/main.js')
    app = await buildApp()
    await app.listen(0, '127.0.0.1')
    baseUrl = await app.getUrl()
    const { PrismaService } = await import('../../src/prisma/prisma.service.js')
    prisma = app.get(PrismaService)
  })

  afterEach(async () => {
    resetRateLimiters(app)
    await prisma.$executeRawUnsafe(`DELETE FROM "InterviewAnswer"`)
    await prisma.taxYear.deleteMany()
    await prisma.$executeRawUnsafe(`DELETE FROM "TaxDataAccessLog"`)
    await prisma.session.deleteMany()
    await prisma.account.deleteMany()
    await prisma.user.deleteMany()
  })

  afterAll(async () => {
    await app.close()
  })

  async function signUp(email: string): Promise<string> {
    const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...TRUSTED_ORIGIN_HEADERS },
      body: JSON.stringify({ email, password: 'a-fine-strong-password-1', name: 'Test User' }),
    })
    expect(response.status).toBe(200)
    return response.headers.get('set-cookie')!.split(';')[0]!
  }

  function getFristen(cookie: string, jahr = STEUERJAHR) {
    return fetch(`${baseUrl}/v1/steuerjahre/${jahr}/fristen`, { headers: { cookie } })
  }

  it(
    'GWT — the Abgabefrist comes from the per-year § 149 Abs. 2 AO Regelwerk, and the response is self-consistent with the server\'s Berlin date',
    async () => {
      const cookie = await signUp('gwt-fristen@example.com')

      const response = await getFristen(cookie)
      expect(response.status).toBe(200)
      const body = (await response.json()) as {
        abgabefrist: string
        heute: string
        stufe: 'keine' | 'warnung' | 'abgelaufen'
        verbleibendeTage: number
        verspaetungszuschlag: { mindestsatzEur: number; prozentProMonat: number }
      }

      expect(body.abgabefrist).toBe('2027-07-31')
      expect(body.heute).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(['keine', 'warnung', 'abgelaufen']).toContain(body.stufe)
      // Self-consistency: verbleibendeTage = frist − heute (the core's whole-day arithmetic).
      const tage = (iso: string) => {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)!
        return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000
      }
      expect(body.verbleibendeTage).toBe(tage(body.abgabefrist) - tage(body.heute))
      expect(body.verspaetungszuschlag).toEqual({ mindestsatzEur: 25, prozentProMonat: 0.25 })
    },
  )

  it('pins each supported year to 31 July of the following year (the explicit Regelwerk)', async () => {
    const cookie = await signUp('regelwerk@example.com')

    for (const [jahr, frist] of [[2024, '2025-07-31'], [2025, '2026-07-31'], [2026, '2027-07-31']] as const) {
      const response = await getFristen(cookie, jahr)
      expect(response.status).toBe(200)
      const body = (await response.json()) as { abgabefrist: string }
      expect(body.abgabefrist).toBe(frist)
    }
  })

  it('an unsupported year is an honest 400 — never a neighbour year\'s frist', async () => {
    const cookie = await signUp('jahr-400@example.com')

    const response = await getFristen(cookie, 2023)
    expect(response.status).toBe(400)
  })

  it('the endpoint requires a real account session — a guest gets 401', async () => {
    const response = await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/fristen`, { headers: TRUSTED_ORIGIN_HEADERS })
    expect(response.status).toBe(401)
  })
})
