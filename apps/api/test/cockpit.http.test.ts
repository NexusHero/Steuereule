// REQ-001 — full-stack (guard + controller) tests against the fake TaxYearRepository,
// driven over real HTTP via light-my-request — no live Postgres required. Complements
// cockpit.service.test.ts (pure service logic) by proving the wiring: the response
// shape matches the frozen frontend contract exactly, userId scoping genuinely flows
// from the guard-set cookie, and "no tax year yet" is a 200 null, never a 404.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveGuestSessionSecret, verifyGuestSession } from '../src/auth/guest-session.js'
import { buildTestApp, extractSessionCookie } from './support/build-test-app.js'
import type { FakeTaxYearRepository } from './fakes/fake-tax-year.repository.js'

process.env.GUEST_SESSION_SECRET = 'cockpit-http-test-secret'

/** Recovers the trusted userId the app minted, from the raw `Set-Cookie`/`Cookie` pair. */
function userIdFromCookie(cookie: string): string {
  const rawValue = cookie.slice(cookie.indexOf('=') + 1)
  const userId = verifyGuestSession(decodeURIComponent(rawValue), resolveGuestSessionSecret())
  if (!userId) {
    throw new Error('test harness: could not recover userId from the session cookie')
  }
  return userId
}

describe('GET /v1/steuerjahre/:jahr/cockpit', () => {
  let app: NestFastifyApplication
  let taxYearRepository: FakeTaxYearRepository

  beforeEach(async () => {
    const built = await buildTestApp()
    app = built.app
    taxYearRepository = built.taxYearRepository
  })

  afterEach(async () => {
    await app.close()
  })

  it('REQ-001 returns 200 null for a fresh guest with no seeded tax year — the honest empty state, not a 404', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/steuerjahre/2026/cockpit' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toBeNull()
  })

  it('REQ-001 returns the CockpitSummaryDto shape the frozen frontend contract expects', async () => {
    const first = await app.inject({ method: 'GET', url: '/v1/steuerjahre/2026/cockpit' })
    const cookie = extractSessionCookie(first.headers['set-cookie'])!
    // Seed directly through the repository (bypassing HTTP — there's no write endpoint
    // for TaxYear, this data always arrives via the Prisma seed, ADR-0003).
    taxYearRepository.seed(userIdFromCookie(cookie), {
      steuerjahr: 2026,
      baseEstimate: 1407,
      openItems: 3,
      openConflicts: 0,
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

  it('REQ-001 scopes strictly to the caller’s userId via UserContextGuard, never a client-supplied id', async () => {
    const seededUserId = 'attacker-does-not-control-this'
    taxYearRepository.seed(seededUserId, { steuerjahr: 2026, baseEstimate: 1407, openItems: 3, openConflicts: 0 })

    // A fresh request has no cookie — the guard mints a brand-new guest userId, which
    // can never equal `seededUserId`, so the seeded row must not be visible.
    const response = await app.inject({ method: 'GET', url: '/v1/steuerjahre/2026/cockpit' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toBeNull()
  })

  it('REQ-001 scopes strictly to steuerjahr: a seeded 2026 row never answers for 2025', async () => {
    const first = await app.inject({ method: 'GET', url: '/v1/steuerjahre/2026/cockpit' })
    const cookie = extractSessionCookie(first.headers['set-cookie'])!
    taxYearRepository.seed(userIdFromCookie(cookie), {
      steuerjahr: 2026,
      baseEstimate: 1407,
      openItems: 3,
      openConflicts: 0,
    })

    const response = await app.inject({ method: 'GET', url: '/v1/steuerjahre/2025/cockpit', headers: { cookie } })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toBeNull()
  })

  it('a non-numeric year in the path is rejected with 400, never silently coerced', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/steuerjahre/not-a-year/cockpit' })

    expect(response.statusCode).toBe(400)
  })
})
