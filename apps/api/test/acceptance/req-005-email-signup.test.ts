// REQ-005 — email/password account creation + async verification (ADR-0012 §6).
// Real Postgres, real HTTP against the actual `buildApp()` boot (never `.inject()`).
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

process.env.GUEST_SESSION_SECRET = 'req-005-secret'
process.env.BETTER_AUTH_SECRET = 'req-005-better-auth-secret-0123456789'
process.env.BETTER_AUTH_URL = 'http://127.0.0.1:39998'

const ALLOWED_ORIGIN = 'https://allowed.example.com'
process.env.CORS_ALLOWED_ORIGINS = ALLOWED_ORIGIN

// Node's own `fetch()` (undici) sends `Sec-Fetch-Mode: cors` by default, which is
// exactly the Fetch-Metadata signal better-auth's CSRF middleware treats as "this
// needs an Origin" (ADR-0012 §5) — same as a real browser. Every state-changing call
// below carries a matching, trusted Origin, exactly as a real browser client would.
const TRUSTED_ORIGIN_HEADERS = { origin: ALLOWED_ORIGIN }

describe('REQ-005 — email/password signup + async verification, against the real server', () => {
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
    vi.unstubAllGlobals()
    await prisma.session.deleteMany()
    await prisma.account.deleteMany()
    await prisma.user.deleteMany()
    // See req-009's afterEach: no forwarded client IP in this environment means
    // login rate limiting (REQ-010) falls back to one shared bucket across every
    // caller, including other acceptance files hitting the same Postgres — clean it
    // up so repeated signups here never trip it for an unrelated reason.
    await prisma.rateLimit.deleteMany()
  })

  afterAll(async () => {
    await app.close()
  })

  it('a valid email + a policy-meeting password creates the account, signs in, and surfaces the honest unverified state', async () => {
    const signUp = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...TRUSTED_ORIGIN_HEADERS },
      body: JSON.stringify({ email: 'onboard@example.com', password: 'a-fine-strong-password-1', name: 'Onboard' }),
    })
    expect(signUp.status).toBe(200)
    const signUpBody = (await signUp.json()) as { token: string | null; user: { emailVerified: boolean } }
    // Account works immediately — signed in on signup (autoSignIn), not blocked on
    // verification (REQ-005's "while unverified, honest state, never blocking basic use").
    expect(signUpBody.token).not.toBeNull()
    expect(signUpBody.user.emailVerified).toBe(false)

    const cookie = signUp.headers.get('set-cookie')!.split(';')[0]!
    const session = await fetch(`${baseUrl}/api/auth/get-session`, { headers: { cookie } })
    const sessionBody = (await session.json()) as { user: { emailVerified: boolean } }
    // The UI's "please verify" banner is rendered from exactly this flag — never
    // silently assumed verified.
    expect(sessionBody.user.emailVerified).toBe(false)

    // Basic use isn't blocked: the guarded profile endpoint still answers under the
    // real account session while unverified.
    const profile = await fetch(`${baseUrl}/v1/profile`, { headers: { cookie } })
    expect(profile.status).toBe(200)
  })

  it('following the verification link marks the account verified', async () => {
    const emailSpy = vi.fn()
    const originalConsoleLog = console.log
    console.log = (...args: unknown[]) => {
      emailSpy(...args)
      originalConsoleLog(...args)
    }

    try {
      const signUp = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...TRUSTED_ORIGIN_HEADERS },
        body: JSON.stringify({ email: 'verify-me@example.com', password: 'a-fine-strong-password-1', name: 'Verify Me' }),
      })
      expect(signUp.status).toBe(200)

      const logLine = emailSpy.mock.calls.map((call) => String(call[0])).find((line) => line.includes('verify-me@example.com'))
      expect(logLine).toBeDefined()
      const token = new URL(logLine!.split(': ')[1]!).searchParams.get('token')!

      const verify = await fetch(`${baseUrl}/api/auth/verify-email?token=${encodeURIComponent(token)}`)
      expect(verify.status).toBe(200)

      const user = await prisma.user.findUnique({ where: { email: 'verify-me@example.com' } })
      expect(user?.emailVerified).toBe(true)
    } finally {
      console.log = originalConsoleLog
    }
  })

  // Stubs the one external network dependency (the real HIBP range API) rather than
  // exercising it live: a live third-party call in an acceptance suite would be
  // flaky/rate-limited and untestable for the "confirmed match" branch on demand.
  // The fail-open-on-real-outage behaviour is proven at the unit level
  // (breach-check.test.ts) and demonstrated end-to-end in review evidence; this
  // isolates *our* rejection wiring from HIBP's actual availability.
  describe('the known-breach check (REQ-010, must land no later than REQ-005)', () => {
    it('a password matching a simulated known-breach response is rejected before the account is created', async () => {
      // A real HIBP range response can't be pre-computed for an arbitrary password
      // without reversing SHA-1, so the stub recomputes the exact same k-anonymity
      // hash breach-check.ts's underlying plugin does and echoes its own suffix back
      // as a "match" — proving the real plugin's request/parse/compare logic runs
      // end-to-end, not just that our wrapper plugin exists.
      // Counted, not just invoked — a green run alone can't tell "our stub
      // intercepted the call" apart from "the request reached the live HIBP API and
      // it happened to answer the same way" (Musti's review on #253: this file's own
      // first `it`, above, stubs nothing and genuinely calls the live provider on
      // every run, so the suite demonstrably can reach it). Asserting this count is
      // what makes the rest of this test's claim falsifiable regardless of what the
      // live corpus contains.
      let hibpStubHits = 0
      const realFetch = globalThis.fetch
      vi.stubGlobal('fetch', async (input: string | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url.startsWith('https://api.pwnedpasswords.com/range/')) {
          hibpStubHits += 1
          // We don't know our own password's real SHA-1 suffix without recomputing
          // it here, so recompute the exact same way breach-check.ts does and echo
          // it back as a "match" — proving the plugin's real matching logic (data
          // parsing, suffix comparison) runs correctly end-to-end, not just that our
          // wrapper exists.
          const { createHash } = await import('node:crypto')
          const sha1 = createHash('sha1').update('correct horse battery staple', 'utf8').digest('hex').toUpperCase()
          const suffix = sha1.slice(5)
          return new Response(`${suffix}:1`, { status: 200 })
        }
        // Every other fetch (including this test's own calls to the real server
        // below) passes straight through — only the HIBP call is stubbed.
        return realFetch(input, init)
      })

      const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...TRUSTED_ORIGIN_HEADERS },
        body: JSON.stringify({
          email: 'breached@example.com',
          password: 'correct horse battery staple',
          name: 'Breached',
        }),
      })

      expect(hibpStubHits).toBe(1)

      expect(response.status).toBeGreaterThanOrEqual(400)
      // Pins the cause, not just the failure: `status >= 400` + no user row holds for
      // *any* signup failure (a CSRF rejection, a Postgres error, or a rate-limit
      // trip — this file's own afterEach comment names the shared-bucket rate limiter
      // as a live hazard). Asserting the exact `PASSWORD_COMPROMISED` code —
      // `isBreachedPasswordError`'s shape, `apps/api/src/auth/breach-check.ts` — is
      // what makes this the acceptance-tier counterpart of breach-check.test.ts's
      // unit-tier assertion, and it's also REQ-010's "rejected with a clear message"
      // half: the status alone proves rejection, the code proves it carries an
      // identifiable, non-generic reason.
      const responseBody = (await response.json()) as { code?: string }
      expect(responseBody.code).toBe('PASSWORD_COMPROMISED')

      const user = await prisma.user.findUnique({ where: { email: 'breached@example.com' } })
      expect(user).toBeNull()
    })
  })
})
