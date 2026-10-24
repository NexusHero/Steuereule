// REQ-007 — opt-in TOTP 2FA (better-auth `two-factor` plugin), real Postgres + real
// HTTP. Proves the Register-tier acceptance clauses: (1) a signed-in account holder can
// register a TOTP authenticator and confirm one generated code; (2) once a second factor
// is registered, a later login prompts for it *after* the primary factor succeeds; (3) a
// factor can be removed only after re-authenticating (wrong password is rejected); and
// (4) 2FA is opt-in — a fresh account starts with `twoFactorEnabled: false`.
//
// WebAuthn passkey is NOT exercised here: better-auth 1.6.24 has no passkey support (the
// `@better-auth/passkey` package requires a better-auth ^1.7 core upgrade — see REQ-007's
// register row). That half is a documented follow-up, not silently dropped.
import { createHmac } from 'node:crypto'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { resetRateLimiters } from '../support/reset-rate-limiters.js'

process.env.GUEST_SESSION_SECRET = 'req-007-secret'
process.env.BETTER_AUTH_SECRET = 'req-007-better-auth-secret-0123456789'
process.env.BETTER_AUTH_URL = 'http://127.0.0.1:39997'

const ALLOWED_ORIGIN = 'https://allowed.example.com'
process.env.CORS_ALLOWED_ORIGINS = ALLOWED_ORIGIN

const PASSWORD = 'a-fine-strong-password-1'
const TRUSTED_ORIGIN_HEADERS = { origin: ALLOWED_ORIGIN }

/** RFC 6238 TOTP (HMAC-SHA1, base32 secret, 6 digits, 30s period) — the exact algorithm
 *  better-auth's own `createOTP(...).totp()` uses (verified against
 *  `@better-auth/utils/otp`: base32 alphabet "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567", SHA-1,
 *  counter = floor(now/period)). Independent of better-auth so a test cannot confirm a
 *  code against the same code it generated. */
function generateTotp(secret: string, period = 30, digits = 6): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let buffer = 0
  let bits = 0
  const bytes: number[] = []
  for (const c of secret.toUpperCase().replace(/=+$/, '')) {
    const v = alphabet.indexOf(c)
    if (v === -1) throw new Error(`invalid base32 char ${c}`)
    buffer = (buffer << 5) | v
    bits += 5
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  const counter = Math.floor(Date.now() / 1000 / period)
  const counterBuf = Buffer.alloc(8)
  counterBuf.writeBigUInt64BE(BigInt(counter))
  const hmac = createHmac('sha1', Buffer.from(bytes)).update(counterBuf).digest()
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f
  const code =
    (((hmac[offset] ?? 0) & 0x7f) << 24) |
    (((hmac[offset + 1] ?? 0) & 0xff) << 16) |
    (((hmac[offset + 2] ?? 0) & 0xff) << 8) |
    ((hmac[offset + 3] ?? 0) & 0xff)
  const truncated = code % 10 ** digits
  return truncated.toString().padStart(digits, '0')
}

/** Extracts the base32 TOTP secret out of an `otpauth://` URI. */
function secretFromTotpUri(totpURI: string): string {
  const url = new URL(totpURI)
  const secret = url.searchParams.get('secret')
  if (!secret) throw new Error(`no secret in totpURI: ${totpURI}`)
  return secret
}

/** Pulls one `name=value` cookie pair out of a (possibly multi-cookie) Set-Cookie header. */
function cookieNamed(setCookie: string | null, name: string): string {
  const match = setCookie?.match(new RegExp(`([^, ]*${name}=[^;]*)`))
  if (!match) throw new Error(`no ${name} cookie in set-cookie: ${setCookie}`)
  // The regex carries exactly one capture group, so `match[1]` is always present on a match.
  return match[1]!
}

describe('REQ-007 — TOTP 2FA round trip, against the real server', () => {
  let app: NestFastifyApplication
  let baseUrl: string
  let prisma: PrismaClient

  beforeAll(async () => {
    process.env.BETTER_AUTH_URL = 'http://127.0.0.1:39997'
    const { buildApp } = await import('../../src/main.js')
    app = await buildApp()
    await app.listen(0, '127.0.0.1')
    baseUrl = await app.getUrl()
    const { PrismaService } = await import('../../src/prisma/prisma.service.js')
    prisma = app.get(PrismaService)
  })

  afterEach(async () => {
    resetRateLimiters(app)
    await prisma.twoFactor.deleteMany()
    await prisma.session.deleteMany()
    await prisma.account.deleteMany()
    await prisma.verification.deleteMany()
    await prisma.user.deleteMany()
    await prisma.profile.deleteMany()
  })

  afterAll(async () => {
    await app.close()
  })

  async function signUp(email: string): Promise<string> {
    const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...TRUSTED_ORIGIN_HEADERS },
      body: JSON.stringify({ email, password: PASSWORD, name: 'Req 007' }),
    })
    expect(response.status).toBe(200)
    return cookieNamed(response.headers.get('set-cookie'), 'session_token')
  }

  async function enableTotp(cookie: string): Promise<{ totpURI: string; backupCodes: string[] }> {
    const response = await fetch(`${baseUrl}/api/auth/two-factor/enable`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json', ...TRUSTED_ORIGIN_HEADERS },
      body: JSON.stringify({ password: PASSWORD }),
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { totpURI: string; backupCodes: string[] }
    expect(body.totpURI).toMatch(/^otpauth:\/\//)
    expect(body.backupCodes.length).toBeGreaterThan(0)
    return body
  }

  it('is opt-in: a fresh account starts with twoFactorEnabled false', async () => {
    const cookie = await signUp('req007-optin@example.com')
    const session = await fetch(`${baseUrl}/api/auth/get-session`, { headers: { cookie } })
    const body = (await session.json()) as { user: { twoFactorEnabled: boolean } }
    expect(body.user.twoFactorEnabled).toBe(false)
  })

  it('registers a TOTP authenticator and confirms one generated code (twoFactorEnabled flips true)', async () => {
    const cookie = await signUp('req007-enable@example.com')
    const { totpURI, backupCodes } = await enableTotp(cookie)
    expect(backupCodes.length).toBeGreaterThan(0)

    // Confirming one generated code is what actually turns 2FA on — before that, the
    // user.twoFactorEnabled flag must still read false.
    const beforeVerify = await fetch(`${baseUrl}/api/auth/get-session`, { headers: { cookie } })
    expect(((await beforeVerify.json()) as { user: { twoFactorEnabled: boolean } }).user.twoFactorEnabled).toBe(false)

    const code = generateTotp(secretFromTotpUri(totpURI))
    const verify = await fetch(`${baseUrl}/api/auth/two-factor/verify-totp`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json', ...TRUSTED_ORIGIN_HEADERS },
      body: JSON.stringify({ code }),
    })
    expect(verify.status).toBe(200)
    // Verification rotates the session (better-auth re-issues the cookie so the
    // `twoFactorEnabled` flag reaches the client) — read back through the fresh session.
    const freshCookie = cookieNamed(verify.headers.get('set-cookie'), 'session_token')
    const afterVerify = await fetch(`${baseUrl}/api/auth/get-session`, { headers: { cookie: freshCookie } })
    expect(((await afterVerify.json()) as { user: { twoFactorEnabled: boolean } }).user.twoFactorEnabled).toBe(true)

    // The TOTP secret is encrypted at rest (better-auth's symmetricEncrypt), never the
    // base32 secret the URI exposes — REQ-007 shares REQ-003's "no plaintext at rest".
    const row = await prisma.twoFactor.findFirst({ where: { user: { email: 'req007-enable@example.com' } } })
    expect(row).not.toBeNull()
    expect(row!.secret).not.toContain(secretFromTotpUri(totpURI))
    expect(row!.verified).toBe(true)
  })

  it('prompts for the second factor after the primary factor succeeds on a later login', async () => {
    const cookie = await signUp('req007-login@example.com')
    const { totpURI } = await enableTotp(cookie)
    const code = generateTotp(secretFromTotpUri(totpURI))
    const enableVerify = await fetch(`${baseUrl}/api/auth/two-factor/verify-totp`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json', ...TRUSTED_ORIGIN_HEADERS },
      body: JSON.stringify({ code }),
    })
    expect(enableVerify.status).toBe(200)

    // Primary factor (email+password) succeeds but does NOT establish a session — it
    // answers with a two-factor challenge and clears the provisional session cookie.
    const signIn = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...TRUSTED_ORIGIN_HEADERS },
      body: JSON.stringify({ email: 'req007-login@example.com', password: PASSWORD }),
    })
    expect(signIn.status).toBe(200)
    const challenge = (await signIn.json()) as { twoFactorRedirect: boolean; twoFactorMethods: string[] }
    expect(challenge.twoFactorRedirect).toBe(true)
    expect(challenge.twoFactorMethods).toContain('totp')
    const setCookie = signIn.headers.get('set-cookie')
    expect(setCookie).toContain('two_factor=')

    // Completing the second factor (with the challenge cookie) establishes the session.
    const challengeCookie = cookieNamed(setCookie, 'two_factor')
    const secondCode = generateTotp(secretFromTotpUri(totpURI))
    const complete = await fetch(`${baseUrl}/api/auth/two-factor/verify-totp`, {
      method: 'POST',
      headers: { cookie: challengeCookie, 'content-type': 'application/json', ...TRUSTED_ORIGIN_HEADERS },
      body: JSON.stringify({ code: secondCode }),
    })
    expect(complete.status).toBe(200)
    const sessionCookie = cookieNamed(complete.headers.get('set-cookie'), 'session_token')
    const session = await fetch(`${baseUrl}/api/auth/get-session`, { headers: { cookie: sessionCookie } })
    expect(((await session.json()) as { user: { email: string } }).user.email).toBe('req007-login@example.com')
  })

  it('rejects factor removal without a correct password (re-authentication required)', async () => {
    const cookie = await signUp('req007-remove@example.com')
    const { totpURI } = await enableTotp(cookie)
    const code = generateTotp(secretFromTotpUri(totpURI))
    const enableVerify = await fetch(`${baseUrl}/api/auth/two-factor/verify-totp`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json', ...TRUSTED_ORIGIN_HEADERS },
      body: JSON.stringify({ code }),
    })
    expect(enableVerify.status).toBe(200)
    const freshCookie = cookieNamed(enableVerify.headers.get('set-cookie'), 'session_token')

    const wrongPassword = await fetch(`${baseUrl}/api/auth/two-factor/disable`, {
      method: 'POST',
      headers: { cookie: freshCookie, 'content-type': 'application/json', ...TRUSTED_ORIGIN_HEADERS },
      body: JSON.stringify({ password: 'wrong-password-12345' }),
    })
    expect(wrongPassword.status).toBeGreaterThanOrEqual(400)

    const still = await fetch(`${baseUrl}/api/auth/get-session`, { headers: { cookie: freshCookie } })
    expect(((await still.json()) as { user: { twoFactorEnabled: boolean } }).user.twoFactorEnabled).toBe(true)
  })

  it('removes the factor after a correct password re-authentication', async () => {
    const cookie = await signUp('req007-remove-ok@example.com')
    const { totpURI } = await enableTotp(cookie)
    const code = generateTotp(secretFromTotpUri(totpURI))
    const enableVerify = await fetch(`${baseUrl}/api/auth/two-factor/verify-totp`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json', ...TRUSTED_ORIGIN_HEADERS },
      body: JSON.stringify({ code }),
    })
    expect(enableVerify.status).toBe(200)
    const freshCookie = cookieNamed(enableVerify.headers.get('set-cookie'), 'session_token')

    const disable = await fetch(`${baseUrl}/api/auth/two-factor/disable`, {
      method: 'POST',
      headers: { cookie: freshCookie, 'content-type': 'application/json', ...TRUSTED_ORIGIN_HEADERS },
      body: JSON.stringify({ password: PASSWORD }),
    })
    expect(disable.status).toBe(200)

    const disableCookie = cookieNamed(disable.headers.get('set-cookie'), 'session_token')
    const after = await fetch(`${baseUrl}/api/auth/get-session`, { headers: { cookie: disableCookie } })
    expect(((await after.json()) as { user: { twoFactorEnabled: boolean } }).user.twoFactorEnabled).toBe(false)
    expect(await prisma.twoFactor.count({ where: { user: { email: 'req007-remove-ok@example.com' } } })).toBe(0)
  })
})
