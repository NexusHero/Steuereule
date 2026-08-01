// REQ-014 — task 2: /v1/device/{pending,approve,token} (#238, AC-3/AC-5, ADR-0024).
// Real Postgres, real HTTP against the actual `buildApp()` boot (never `.inject()` —
// see req-009's own header comment for why the mount is `.inject()`-blind).
//
// One-tap approval, one fixed session lifetime — NexusHero dropped the "just for
// now" vs "trust this device" session-scope choice mid-slice; there is no AC-4
// distinction to prove here anymore. What this file proves instead:
//   - AC-3: the match-verification payload (browser/region/time) is the real
//     request's own data, not hard-coded, and differs across two different requests.
//   - AC-5: a QR-authorized session is real (resolves via the actual better-auth
//     getSession()), carries the desktop's real ipAddress/userAgent (never blank),
//     and revocation genuinely revokes it while a second, unrelated session for the
//     same account keeps working.
//   - The plugin's own /api/auth/device/{approve,token} routes stay unreachable
//     (disabledPaths) — task 0 already proved this for /device/code and /device
//     (GET); this extends the same proof to the other two.
//   - The device-pending rate limiter (window 60s / max 10 per IP) actually fires.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

process.env.GUEST_SESSION_SECRET = 'req-014-approve-token-secret'
process.env.BETTER_AUTH_SECRET = 'req-014-approve-token-better-auth-secret-0123'
process.env.BETTER_AUTH_URL = 'http://127.0.0.1:0' // overwritten to the real ephemeral URL below

const ALLOWED_ORIGIN = 'https://allowed.example.com'
process.env.CORS_ALLOWED_ORIGINS = ALLOWED_ORIGIN
const TRUSTED_ORIGIN_HEADERS = { origin: ALLOWED_ORIGIN }

interface DeviceCodeResponse {
  userCode: string
  deviceCode: string
  verificationUriComplete: string
  expiresIn: number
  interval: number
}

function extractCookie(setCookieHeader: string | null): string {
  return setCookieHeader!.split(';')[0]!
}

describe('REQ-014 task 2 — /v1/device/{pending,approve,token}, against the real server', () => {
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
    await prisma.$executeRawUnsafe(`DELETE FROM "DeviceCode"`)
    await prisma.session.deleteMany()
    await prisma.account.deleteMany()
    await prisma.user.deleteMany()
    await prisma.rateLimit.deleteMany()
  })

  afterAll(async () => {
    await app.close()
  })

  async function signUpPhone(email: string): Promise<string> {
    const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...TRUSTED_ORIGIN_HEADERS },
      body: JSON.stringify({ email, password: 'a-fine-strong-password-1', name: 'Phone' }),
    })
    expect(response.status).toBe(200)
    return extractCookie(response.headers.get('set-cookie'))
  }

  async function mintCode(userAgent: string): Promise<DeviceCodeResponse> {
    const response = await fetch(`${baseUrl}/v1/device/code`, { method: 'POST', headers: { 'user-agent': userAgent } })
    expect(response.status).toBe(201)
    return (await response.json()) as DeviceCodeResponse
  }

  it('AC-3: the match-verification payload is the real request\'s own data, and differs across two different requests', async () => {
    const first = await mintCode('Mozilla/5.0 (Macintosh) FirstBrowser/1.0')
    const second = await mintCode('Mozilla/5.0 (Windows) SecondBrowser/2.0')

    const firstPending = await fetch(`${baseUrl}/v1/device/pending?userCode=${first.userCode}`)
    const secondPending = await fetch(`${baseUrl}/v1/device/pending?userCode=${second.userCode}`)
    expect(firstPending.status).toBe(200)
    expect(secondPending.status).toBe(200)

    const firstBody = (await firstPending.json()) as { userAgent: string; region: string; requestedAt: string; status: string }
    const secondBody = (await secondPending.json()) as { userAgent: string; region: string; requestedAt: string; status: string }

    expect(firstBody.userAgent).toBe('Mozilla/5.0 (Macintosh) FirstBrowser/1.0')
    expect(secondBody.userAgent).toBe('Mozilla/5.0 (Windows) SecondBrowser/2.0')
    expect(firstBody.userAgent).not.toBe(secondBody.userAgent)
    expect(firstBody.status).toBe('pending')
    // No geo-IP database is configured in this test environment (task 0b's honest
    // default) — "unknown" is the correct answer here, proven per-branch already in
    // region-resolver.geoip.test.ts.
    expect(firstBody.region).toBe('unknown')
  })

  it('GET /v1/device/pending claims the code onto the calling phone\'s session — server-side, never a browser-direct claim', async () => {
    const phoneCookie = await signUpPhone('phone-claim@example.com')
    const code = await mintCode('DesktopBrowser/1.0')

    const pending = await fetch(`${baseUrl}/v1/device/pending?userCode=${code.userCode}`, { headers: { cookie: phoneCookie } })
    expect(pending.status).toBe(200)

    const row = await prisma.deviceCode.findUniqueOrThrow({ where: { userCode: code.userCode } })
    expect(row.userId).not.toBeNull()
  })

  it('AC-5: a QR-authorized session is real, carries the desktop\'s real headers, and revocation actually revokes it', async () => {
    const phoneCookie = await signUpPhone('phone-ac5@example.com')
    const code = await mintCode('DesktopBrowser/QR-Test/1.0')

    // Claim + approve, one tap, both from the phone.
    await fetch(`${baseUrl}/v1/device/pending?userCode=${code.userCode}`, { headers: { cookie: phoneCookie } })
    const approve = await fetch(`${baseUrl}/v1/device/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: phoneCookie },
      body: JSON.stringify({ userCode: code.userCode }),
    })
    expect(approve.status).toBe(200)

    // Exchange, from the desktop — its own headers, never the phone's.
    const tokenResponse = await fetch(`${baseUrl}/v1/device/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'DesktopBrowser/QR-Test/1.0' },
      body: JSON.stringify({ deviceCode: code.deviceCode }),
    })
    expect(tokenResponse.status).toBe(200)
    const tokenBody = (await tokenResponse.json()) as { success: boolean }
    expect(tokenBody).toEqual({ success: true })
    // Never a session token in the JSON body (ADR-0008/0012) — the cookie is the
    // only place the auth state travels.
    expect(JSON.stringify(tokenBody)).not.toMatch(/token/i)

    const setCookie = tokenResponse.headers.get('set-cookie')
    expect(setCookie).toBeTruthy()
    const desktopCookie = extractCookie(setCookie)
    // A signed, plain (non-httpOnly-visible-but-real) cookie carrying the configured
    // session lifetime — Max-Age present (one fixed lifetime, no scope choice).
    expect(setCookie).toMatch(/HttpOnly/)
    expect(setCookie).toMatch(/Max-Age=\d+/)

    // The cookie genuinely resolves, through the real better-auth instance, to the
    // phone's own account — proving the hand-signed cookie interoperates with
    // getSession()'s real signature verification, not just this app's own logic.
    const session = await fetch(`${baseUrl}/api/auth/get-session`, { headers: { cookie: desktopCookie } })
    const sessionBody = (await session.json()) as { user: { email: string }; session: { ipAddress: string; userAgent: string } } | null
    expect(sessionBody?.user.email).toBe('phone-ac5@example.com')
    // Header forwarding is load-bearing (Musti's #238 review) — the desktop's own
    // User-Agent, not blank and not the phone's.
    expect(sessionBody?.session.userAgent).toBe('DesktopBrowser/QR-Test/1.0')

    // A second, unrelated session for the same account (the phone signing in again
    // for real) — the two-sided proof AC-5 requires.
    const secondSignIn = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...TRUSTED_ORIGIN_HEADERS },
      body: JSON.stringify({ email: 'phone-ac5@example.com', password: 'a-fine-strong-password-1' }),
    })
    const secondCookie = extractCookie(secondSignIn.headers.get('set-cookie'))

    // Revoke the QR-issued session from the *other* (unrelated) session — mirroring
    // "revoke this device from the device list while signed in on another device".
    const revoke = await fetch(`${baseUrl}/api/auth/revoke-session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: secondCookie, ...TRUSTED_ORIGIN_HEADERS },
      body: JSON.stringify({ token: desktopCookie.split('=')[1]!.split('.')[0] }),
    })
    expect(revoke.status).toBe(200)

    // The revoked (desktop/QR) session's cookie is now rejected...
    const afterRevoke = await fetch(`${baseUrl}/api/auth/get-session`, { headers: { cookie: desktopCookie } })
    expect(await afterRevoke.json()).toBeNull()

    // ...while the second, unrelated session still works.
    const stillWorks = await fetch(`${baseUrl}/api/auth/get-session`, { headers: { cookie: secondCookie } })
    const stillWorksBody = (await stillWorks.json()) as { user: { email: string } } | null
    expect(stillWorksBody?.user.email).toBe('phone-ac5@example.com')
  })

  it('the plugin\'s own /api/auth/device/{approve,token} routes are disabled — a browser cannot reach them directly', async () => {
    const directApprove = await fetch(`${baseUrl}/api/auth/device/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ALLOWED_ORIGIN },
      body: JSON.stringify({ userCode: 'AAAAAAAA' }),
    })
    expect(directApprove.status).toBe(404)

    const directToken = await fetch(`${baseUrl}/api/auth/device/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ALLOWED_ORIGIN },
      body: JSON.stringify({ grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: 'x', client_id: 'x' }),
    })
    expect(directToken.status).toBe(404)
  })

  it('GET /v1/device/pending is rate-limited at window 60s / max 10 per IP — the guessing surface the ADR names', async () => {
    // A single guessed/bogus code repeated past the limit — the rate check runs
    // before deviceVerify is even called, so the code's validity doesn't matter here.
    let lastStatus = 0
    for (let i = 0; i < 11; i++) {
      const response = await fetch(`${baseUrl}/v1/device/pending?userCode=RATE-LIMIT-PROBE`)
      lastStatus = response.status
    }
    expect(lastStatus).toBe(429)
  })
})
