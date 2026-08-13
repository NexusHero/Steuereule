// REQ-010 — the rate-limit ceiling raise (#350, stakeholder-ruled numbers), proven
// per path so a `customRules` key that never matches (ADR-0021's own shape — "the
// ceiling looks raised and isn't") cannot hide behind a single aggregate assertion.
// Real Postgres, real HTTP against the actual `buildApp()` boot — never `.inject()`.
//
// Depends on the IP-resolution seam (#350/ADR-0035) landing first: every path here
// is keyed per real caller now, so this file's single test process (one real
// loopback peer per describe block) exhausting its own bucket is the correct,
// intended behaviour — not the pre-seam global-bucket defect
// `trusted-proxies-ip-resolution.test.ts` documents and proves fixed.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

const ORIGIN = 'https://allowed.example.com'

async function postAuth(baseUrl: string, path: string, body: Record<string, unknown>): Promise<number> {
  const response = await fetch(`${baseUrl}/api/auth${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify(body),
  })
  return response.status
}

/** Sends `attempts` requests to `path` (a fresh, unique-enough body per attempt so a
 *  real domain rule downstream never rejects the request before the rate limiter has
 *  a chance to count it) and returns every observed status. */
async function hammer(baseUrl: string, path: string, attempts: number, bodyFor: (i: number) => Record<string, unknown>): Promise<number[]> {
  const statuses: number[] = []
  for (let i = 0; i < attempts; i += 1) {
    statuses.push(await postAuth(baseUrl, path, bodyFor(i)))
  }
  return statuses
}

describe('REQ-010 — rate-limit ceilings raised by #350, proven per customRules path', () => {
  let app: NestFastifyApplication
  let baseUrl: string
  let prisma: PrismaClient

  beforeAll(async () => {
    process.env.GUEST_SESSION_SECRET = 'ceilings-secret'
    process.env.BETTER_AUTH_SECRET = 'ceilings-better-auth-secret-0123456789'
    process.env.BETTER_AUTH_URL = 'http://127.0.0.1:0'
    process.env.CORS_ALLOWED_ORIGINS = ORIGIN
    delete process.env.TRUSTED_PROXIES
    const { buildApp } = await import('../../src/main.js')
    app = await buildApp()
    await app.listen(0, '127.0.0.1')
    baseUrl = await app.getUrl()
    const { PrismaService } = await import('../../src/prisma/prisma.service.js')
    prisma = app.get(PrismaService)
  })

  afterEach(async () => {
    await prisma.session.deleteMany()
    await prisma.account.deleteMany()
    await prisma.user.deleteMany()
    await prisma.rateLimit.deleteMany()
  })

  afterAll(async () => {
    await app.close()
  })

  async function assertRaisedToFive(path: string, bodyFor: (i: number) => Record<string, unknown>): Promise<void> {
    // 5 attempts must all be admitted by the LIMITER (whatever their own status —
    // some other rule, e.g. HIBP/credential validation, may reject the request
    // content itself; the limiter's own row is what's asserted) — the 6th must trip
    // 429. If the ceiling were silently still 3 (a customRules key that never
    // matched), the 4th attempt would already be 429 — this fails loudly on that.
    const statuses = await hammer(baseUrl, path, 6, bodyFor)
    expect(statuses.slice(0, 5)).not.toContain(429)
    expect(statuses[5]).toBe(429)

    const row = await prisma.rateLimit.findFirst({ where: { key: { contains: path } } })
    expect(row?.count).toBe(5)
  }

  it('POST /sign-in/email — 10s/3 → 10s/5', async () => {
    await postAuth(baseUrl, '/sign-up/email', { email: 'ceiling-sign-in@example.com', password: 'a-fine-strong-password-1', name: 'Ceiling' })
    await prisma.rateLimit.deleteMany()
    await assertRaisedToFive('/sign-in/email', () => ({ email: 'ceiling-sign-in@example.com', password: 'definitely-wrong-password' }))
  })

  it('POST /sign-in/social — 10s/3 → 10s/5', async () => {
    // A malformed/unconfigured provider still reaches the limiter before it reaches
    // provider validation (the limiter runs in the router's onRequest hook, ahead of
    // any endpoint's own handler) — the exact same shape req-010-security-hardening.test.ts's
    // R4 finding already established for /sign-in/email.
    await assertRaisedToFive('/sign-in/social', () => ({ provider: 'google', callbackURL: '/' }))
  })

  it('POST /sign-up/email — 10s/3 → 10s/5', async () => {
    await assertRaisedToFive('/sign-up/email', (i) => ({ email: `ceiling-sign-up-${i}@example.com`, password: 'a-fine-strong-password-1', name: 'Ceiling' }))
  })

  it('POST /change-password — 10s/3 → 10s/5', async () => {
    // Unauthenticated calls are rejected by sensitiveSessionMiddleware, but — same
    // shape as sign-in — the limiter counts before that middleware ever runs.
    await assertRaisedToFive('/change-password', () => ({ newPassword: 'a-fine-strong-password-2', currentPassword: 'definitely-wrong-password' }))
  })

  it('POST /change-email — 10s/3 → 10s/5', async () => {
    await assertRaisedToFive('/change-email', () => ({ newEmail: 'ceiling-change-email@example.com' }))
  })

  it('POST /request-password-reset — 60s/3 → 60s/5 — the WINDOW stays 60s, only max moves', async () => {
    await postAuth(baseUrl, '/sign-up/email', { email: 'ceiling-reset@example.com', password: 'a-fine-strong-password-1', name: 'Ceiling' })
    await prisma.rateLimit.deleteMany()
    const statuses = await hammer(baseUrl, '/request-password-reset', 6, () => ({ email: 'ceiling-reset@example.com' }))
    expect(statuses.slice(0, 5)).not.toContain(429)
    expect(statuses[5]).toBe(429)

    const row = await prisma.rateLimit.findFirst({ where: { key: { contains: '/request-password-reset' } } })
    expect(row?.count).toBe(5)
    // The window itself, not just the max: a fresh attempt one second later (well
    // inside 60s, and also well inside the OLD, wrong "10s" the first draft of the
    // ruling read) must still be blocked — proving this is genuinely a 60s window,
    // not a 10s one that would already have let a new attempt through.
    await new Promise((resolve) => setTimeout(resolve, 1_000))
    const stillBlocked = await postAuth(baseUrl, '/request-password-reset', { email: 'ceiling-reset@example.com' })
    expect(stillBlocked).toBe(429)
  })

  it('POST /send-verification-email — 60s/3 → 60s/5', async () => {
    await postAuth(baseUrl, '/sign-up/email', { email: 'ceiling-verify@example.com', password: 'a-fine-strong-password-1', name: 'Ceiling' })
    await prisma.rateLimit.deleteMany()
    const statuses = await hammer(baseUrl, '/send-verification-email', 6, () => ({ email: 'ceiling-verify@example.com' }))
    expect(statuses.slice(0, 5)).not.toContain(429)
    expect(statuses[5]).toBe(429)

    const row = await prisma.rateLimit.findFirst({ where: { key: { contains: '/send-verification-email' } } })
    expect(row?.count).toBe(5)
  })

  it('GET /get-session — untouched: still the generic default, 100/10s, unchanged by this ticket', async () => {
    // Only the seam's per-client scoping applies here — the stakeholder ruled the
    // number stays exactly as it was. 10 requests, comfortably under 100, must all
    // be admitted (no 429) — a regression here would mean this ticket touched a
    // ceiling it was explicitly told not to.
    const statuses: number[] = []
    for (let i = 0; i < 10; i += 1) {
      const response = await fetch(`${baseUrl}/api/auth/get-session`, { headers: { origin: ORIGIN } })
      statuses.push(response.status)
    }
    expect(statuses).not.toContain(429)
  })

  it('POST /verify-password — pinned at 10s/3, unchanged by this ticket', async () => {
    const statuses = await hammer(baseUrl, '/verify-password', 4, () => ({ password: 'definitely-wrong-password' }))
    // Pinned at the OLD ceiling (3), not raised — the 4th attempt must already trip
    // 429, proving this path was deliberately left off the raise.
    expect(statuses[3]).toBe(429)
  })
})
