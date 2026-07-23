// REQ-011 — DSGVO export/delete (ADR-0013). Real Postgres, real HTTP against the
// actual `buildApp()` boot (never `.inject()`), same convention as every other
// acceptance suite (ADR-0010/ADR-0012).
//
// File ownership (coordinate before editing, #128/#127): Enis (BE-B, #128) owns this
// file — the `DELETE /v1/account` describe block below. Robin's export endpoint
// (#127, BE-A) shares the `REQ-011` tag; his cases belong in their own top-level
// `describe('REQ-011 — export ...')` block appended to this same file (or, if that
// ever collides awkwardly with concurrent edits, a sibling
// `req-011-export.test.ts` — either is fine, just don't restructure this block).
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

process.env.GUEST_SESSION_SECRET = 'req-011-secret'
process.env.BETTER_AUTH_SECRET = 'req-011-better-auth-secret-0123456789'
process.env.BETTER_AUTH_URL = 'http://127.0.0.1:39995'

const ALLOWED_ORIGIN = 'https://allowed.example.com'
process.env.CORS_ALLOWED_ORIGINS = ALLOWED_ORIGIN
// See req-005/req-009/req-010: Node's fetch() sends Sec-Fetch-Mode by default, so every
// state-changing better-auth call needs a trusted Origin, same as a real browser.
const TRUSTED_ORIGIN_HEADERS = { origin: ALLOWED_ORIGIN }

const STRONG_PASSWORD = 'a-fine-strong-password-1'

describe('REQ-011 T1 — DELETE /v1/account, against the real server (ADR-0013)', () => {
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
    await prisma.session.deleteMany()
    await prisma.account.deleteMany()
    await prisma.verification.deleteMany()
    await prisma.user.deleteMany()
    await prisma.profile.deleteMany()
    await prisma.legalHold.deleteMany()
    await prisma.$executeRawUnsafe(`DELETE FROM "TaxDataAccessLog"`)
    // See req-005/req-009/req-010's afterEach: no forwarded client IP means the
    // rate limiter shares one bucket across every caller in this environment.
    await prisma.rateLimit.deleteMany()
  })

  afterAll(async () => {
    await app.close()
  })

  /** Signs a brand-new account up (fresh session — createdAt is "now") and returns its
   *  userId + session cookie, ready to drive PUT /v1/profile or DELETE /v1/account. */
  async function signUp(email: string): Promise<{ userId: string; cookie: string }> {
    const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...TRUSTED_ORIGIN_HEADERS },
      body: JSON.stringify({ email, password: STRONG_PASSWORD, name: 'REQ-011' }),
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { user: { id: string } }
    const cookie = response.headers.get('set-cookie')!.split(';')[0]!
    return { userId: body.user.id, cookie }
  }

  async function saveProfile(cookie: string, steuerId: string): Promise<void> {
    const response = await fetch(`${baseUrl}/v1/profile`, {
      method: 'PUT',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ firstName: 'Erika', lastName: 'Musterfrau', steuerId, steuernummer: null }),
    })
    expect(response.status).toBe(200)
  }

  /** Backdates a signed-in account's session past the fresh-auth window (ADR-0013 §6),
   *  so DELETE /v1/account is forced onto the password-re-verification branch.
   *
   *  The `Set-Cookie` value is better-auth's own `<token>.<HMAC signature>` envelope,
   *  URL-encoded (see `better-auth/cookies`) — only the `<token>` part before the first
   *  `.` is the raw value stored in the `Session.token` column. An earlier version of
   *  this helper matched on the *whole* cookie value (signature included), which never
   *  matched any row: `updateMany` silently updated zero rows, the session never
   *  actually went stale, and both this test and the rate-limit test below passed the
   *  fresh-auth branch on the very first (unauthenticated-as-stale) attempt — a bug in
   *  the test, caught by the real-Postgres integration run before this reached review. */
  async function makeSessionStale(cookie: string): Promise<void> {
    const rawValue = decodeURIComponent(cookie.split('=').slice(1).join('='))
    const token = rawValue.split('.')[0]!
    const staleCreatedAt = new Date(Date.now() - 10 * 60 * 1000) // 10 minutes ago
    const { count } = await prisma.session.updateMany({ where: { token }, data: { createdAt: staleCreatedAt } })
    if (count !== 1) {
      throw new Error(`makeSessionStale: expected to backdate exactly 1 session row, updated ${count}`)
    }
  }

  async function deleteAccount(cookie: string, body: Record<string, unknown>): Promise<Response> {
    return fetch(`${baseUrl}/v1/account`, {
      method: 'DELETE',
      headers: { cookie, 'content-type': 'application/json', ...TRUSTED_ORIGIN_HEADERS },
      body: JSON.stringify(body),
    })
  }

  it('irrecoverability — a fresh session deletes the Profile row for real (no soft-delete flag), and the response is honest', async () => {
    const { userId, cookie } = await signUp('req011-happy@example.com')
    await saveProfile(cookie, '02476291358')

    const response = await deleteAccount(cookie, { confirm: true })
    expect(response.status).toBe(200)
    const result = (await response.json()) as {
      deleted: { profile: boolean; account: boolean }
      retainedAnonymisedAuditRows: number
      retainedUnderLegalHold: number
    }

    // Secrets-excluded, honest shape (ADR-0013 §8) — exactly these three top-level keys.
    expect(Object.keys(result).sort()).toEqual(['deleted', 'retainedAnonymisedAuditRows', 'retainedUnderLegalHold'])
    expect(result.deleted).toEqual({ profile: true, account: true })
    expect(result.retainedAnonymisedAuditRows).toBeGreaterThan(0)
    expect(result.retainedUnderLegalHold).toBe(0)

    // Genuine server-side erasure — the row is gone, not flagged.
    const profile = await prisma.profile.findUnique({ where: { userId } })
    expect(profile).toBeNull()
    // The better-auth account, its session and its verification token are all gone too.
    const user = await prisma.user.findUnique({ where: { id: userId } })
    expect(user).toBeNull()
    const sessions = await prisma.session.findMany({ where: { userId } })
    expect(sessions).toHaveLength(0)
    const verifications = await prisma.verification.findMany({ where: { identifier: 'req011-happy@example.com' } })
    expect(verifications).toHaveLength(0)

    // The client's session cookie is cleared (ADR-0013's frozen contract).
    const setCookies = response.headers.getSetCookie()
    const cleared = setCookies.find((c) => c.startsWith(cookie.split('=')[0] + '='))
    expect(cleared).toBeDefined()
    expect(cleared).toMatch(/Max-Age=0/)
  })

  it('audit-count preserved under anonymisation — rows are retained, only userId is severed to a tombstone', async () => {
    const { userId, cookie } = await signUp('req011-audit-count@example.com')
    await saveProfile(cookie, '02476291358')
    // A second GET appends a second (READ) audit row, so there is more than one to
    // prove the *count* survives, not just "at least one row remained".
    await fetch(`${baseUrl}/v1/profile`, { headers: { cookie } })

    const beforeCount = await prisma.taxDataAccessLog.count({ where: { userId } })
    expect(beforeCount).toBeGreaterThanOrEqual(2)

    const response = await deleteAccount(cookie, { confirm: true })
    expect(response.status).toBe(200)

    // No row was deleted — the total row count for this now-anonymised history is
    // unchanged, only accessible under the tombstone id instead of the real userId.
    const stillUnderRealUserId = await prisma.taxDataAccessLog.count({ where: { userId } })
    expect(stillUnderRealUserId).toBe(0)
    const rows = await prisma.$queryRaw<{ userId: string }[]>`
      SELECT "userId" FROM "TaxDataAccessLog" WHERE "userId" LIKE 'deleted:%'
    `
    expect(rows).toHaveLength(beforeCount)
    expect(rows.every((row) => row.userId !== userId)).toBe(true)
  })

  it('trust boundary — deleting account A never touches account B’s profile, session, or audit history', async () => {
    const a = await signUp('req011-trust-a@example.com')
    await saveProfile(a.cookie, '02476291358')
    const b = await signUp('req011-trust-b@example.com')
    await saveProfile(b.cookie, '65929970489')

    const response = await deleteAccount(a.cookie, { confirm: true })
    expect(response.status).toBe(200)

    // A is gone...
    expect(await prisma.profile.findUnique({ where: { userId: a.userId } })).toBeNull()
    expect(await prisma.user.findUnique({ where: { id: a.userId } })).toBeNull()
    // ...B is completely untouched.
    const bProfile = await prisma.profile.findUnique({ where: { userId: b.userId } })
    expect(bProfile).not.toBeNull()
    expect(await prisma.user.findUnique({ where: { id: b.userId } })).not.toBeNull()
    const bAuditRows = await prisma.taxDataAccessLog.count({ where: { userId: b.userId } })
    expect(bAuditRows).toBeGreaterThan(0)

    // There is no id parameter to even attempt to forge with (ADR-0013 §6) — an extra
    // body field is simply rejected by the global ValidationPipe's
    // forbidNonWhitelisted, proving the surface is structurally closed, not merely
    // "not exploited in this test".
    const forged = await deleteAccount(b.cookie, { confirm: true, userId: 'someone-elses-id' })
    expect(forged.status).toBe(400)
    expect(await prisma.user.findUnique({ where: { id: b.userId } })).not.toBeNull()
  })

  it('confirmation gate — omitted or false `confirm` is rejected with 400, and nothing is torn down', async () => {
    const { userId, cookie } = await signUp('req011-confirm-gate@example.com')
    await saveProfile(cookie, '02476291358')

    const omitted = await deleteAccount(cookie, {})
    expect(omitted.status).toBe(400)
    const falseConfirm = await deleteAccount(cookie, { confirm: false })
    expect(falseConfirm.status).toBe(400)

    // Neither request came anywhere near the teardown transaction.
    expect(await prisma.profile.findUnique({ where: { userId } })).not.toBeNull()
    expect(await prisma.user.findUnique({ where: { id: userId } })).not.toBeNull()
  })

  it('atomicity/rollback — an injected mid-transaction failure rolls back the entire teardown, nothing partially deleted', async () => {
    const { userId, cookie } = await signUp('req011-atomic@example.com')
    await saveProfile(cookie, '02476291358')
    const auditRowsBefore = await prisma.taxDataAccessLog.count({ where: { userId } })

    const { deleteAccountTransaction } = await import('../../src/account/delete-account-transaction.js')
    await expect(
      deleteAccountTransaction(prisma, userId, {
        simulateFailureAfterProfileStep: () => {
          throw new Error('simulated mid-transaction failure (REQ-011 ATDD)')
        },
      }),
    ).rejects.toThrow('simulated mid-transaction failure')

    // Nothing committed — not the Profile delete that ran earlier in the same
    // transaction, not the audit anonymisation/account teardown that never ran at all.
    const profile = await prisma.profile.findUnique({ where: { userId } })
    expect(profile).not.toBeNull()
    const user = await prisma.user.findUnique({ where: { id: userId } })
    expect(user).not.toBeNull()
    const auditRowsAfter = await prisma.taxDataAccessLog.count({ where: { userId } })
    expect(auditRowsAfter).toBe(auditRowsBefore)
  })

  it('Löschschutz — without an active hold, deletion proceeds normally', async () => {
    const { userId, cookie } = await signUp('req011-no-hold@example.com')
    await saveProfile(cookie, '02476291358')

    const response = await deleteAccount(cookie, { confirm: true })
    expect(response.status).toBe(200)
    const result = (await response.json()) as { deleted: { profile: boolean }; retainedUnderLegalHold: number }
    expect(result.deleted.profile).toBe(true)
    expect(result.retainedUnderLegalHold).toBe(0)
    expect(await prisma.profile.findUnique({ where: { userId } })).toBeNull()
  })

  it('Löschschutz — an active hold on "profile" exempts the row, but the account is still torn down', async () => {
    const { userId, cookie } = await signUp('req011-active-hold@example.com')
    await saveProfile(cookie, '02476291358')
    await prisma.legalHold.create({
      data: { userId, resource: 'profile', holdUntil: new Date(Date.now() + 60 * 60 * 1000) },
    })

    const response = await deleteAccount(cookie, { confirm: true })
    expect(response.status).toBe(200)
    const result = (await response.json()) as {
      deleted: { profile: boolean; account: boolean }
      retainedUnderLegalHold: number
    }
    expect(result.deleted).toEqual({ profile: false, account: true })
    expect(result.retainedUnderLegalHold).toBeGreaterThanOrEqual(1)

    // The tax-data-adjacent row is retained under legal obligation...
    const profile = await prisma.profile.findUnique({ where: { userId } })
    expect(profile).not.toBeNull()
    // ...but the account/login identity is still fully gone (ADR-0013's frozen
    // contract types `account` as always `true` — Löschschutz never exempts login).
    expect(await prisma.user.findUnique({ where: { id: userId } })).toBeNull()
  })

  it('Löschschutz — an expired hold (holdUntil in the past) does not exempt anything', async () => {
    const { userId, cookie } = await signUp('req011-expired-hold@example.com')
    await saveProfile(cookie, '02476291358')
    await prisma.legalHold.create({
      data: { userId, resource: 'profile', holdUntil: new Date(Date.now() - 60 * 60 * 1000) },
    })

    const response = await deleteAccount(cookie, { confirm: true })
    expect(response.status).toBe(200)
    const result = (await response.json()) as { deleted: { profile: boolean }; retainedUnderLegalHold: number }
    expect(result.deleted.profile).toBe(true)
    expect(result.retainedUnderLegalHold).toBe(0)
    expect(await prisma.profile.findUnique({ where: { userId } })).toBeNull()
  })

  it('a guest session (no real account) cannot delete — there is no account here to tear down', async () => {
    const response = await fetch(`${baseUrl}/v1/account`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', ...TRUSTED_ORIGIN_HEADERS },
      body: JSON.stringify({ confirm: true }),
    })
    expect(response.status).toBe(403)
  })

  it('fresh-auth — a stale session is rejected without a password, and with a wrong one, but succeeds with the right one', async () => {
    const { userId, cookie } = await signUp('req011-fresh-auth@example.com')
    await saveProfile(cookie, '02476291358')
    await makeSessionStale(cookie)

    const withoutPassword = await deleteAccount(cookie, { confirm: true })
    expect(withoutPassword.status).toBe(400)
    expect(await prisma.profile.findUnique({ where: { userId } })).not.toBeNull()

    const withWrongPassword = await deleteAccount(cookie, { confirm: true, password: 'definitely-wrong' })
    expect(withWrongPassword.status).toBe(401)
    expect(await prisma.profile.findUnique({ where: { userId } })).not.toBeNull()

    const withCorrectPassword = await deleteAccount(cookie, { confirm: true, password: STRONG_PASSWORD })
    expect(withCorrectPassword.status).toBe(200)
    expect(await prisma.profile.findUnique({ where: { userId } })).toBeNull()
  })

  it('repeated wrong-password delete attempts trip the same DB-backed rate limit as login (no new mechanism)', async () => {
    const { cookie } = await signUp('req011-rate-limited@example.com')
    await makeSessionStale(cookie)

    const attempts: number[] = []
    for (let i = 0; i < 12; i += 1) {
      const response = await deleteAccount(cookie, { confirm: true, password: 'definitely-wrong' })
      attempts.push(response.status)
    }

    expect(attempts).toContain(429)
    const rows = await prisma.rateLimit.findMany()
    expect(rows.length).toBeGreaterThan(0)
  })
})
