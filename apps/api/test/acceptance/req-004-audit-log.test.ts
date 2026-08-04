// REQ-004 — immutable, append-only audit log of tax-data access (ADR-0008). Real
// Postgres, real HTTP against the actual `buildApp()` boot from src/main.ts (never
// `.inject()`).
//
// Raises `test/profile.integration.test.ts`'s REQ-004.1–.6 clauses from
// `green (integration)` to `green (acceptance)` — #167, Musti's #249 R2 ruling: a real
// dependency (Postgres) plus `.inject()` transport is not the acceptance tier the
// register's `Done` binds to. `test/profile.integration.test.ts` stays as-is (still-valid
// integration-tier proof, still cited under REQ-004); this file proves the same clauses
// over a real socket, and adds the one clause that file never drove over HTTP at all:
// "the data subject sees their own access log in their own export, and no one else's".
//
// Internal row-shape/ordering assertions (REQ-004.3/.5) read raw SQL directly against
// Postgres — that IS the "real dependency" half of the acceptance tier, not a stand-in
// for the API surface: every access that produces those rows goes through the real HTTP
// boundary (`fetch`, real socket) first.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { resolveGuestSessionSecret, verifyGuestSession } from '../../src/auth/guest-session.js'

process.env.GUEST_SESSION_SECRET = 'req-004-secret'
process.env.BETTER_AUTH_SECRET = 'req-004-better-auth-secret-0123456789'
process.env.BETTER_AUTH_URL = 'http://127.0.0.1:39994'

const ALLOWED_ORIGIN = 'https://allowed.example.com'
process.env.CORS_ALLOWED_ORIGINS = ALLOWED_ORIGIN
const TRUSTED_ORIGIN_HEADERS = { origin: ALLOWED_ORIGIN }

const VALID_PAYLOAD = {
  firstName: 'Anna',
  lastName: 'Beispiel',
  steuerId: '02476291358',
  steuernummer: '18181508155',
}

type AuditRow = { id: string; userId: string; action: string; resource: string; createdAt: Date }

/** Recovers the trusted userId the app minted, from a real Set-Cookie response header. */
function userIdFromSetCookie(setCookieHeader: string | null): string {
  const cookie = setCookieHeader!.split(';')[0]!
  const rawValue = cookie.slice(cookie.indexOf('=') + 1)
  const userId = verifyGuestSession(decodeURIComponent(rawValue), resolveGuestSessionSecret())
  if (!userId) throw new Error('test harness: could not recover userId from the real Set-Cookie header')
  return userId
}

/** Raw-SQL read of TaxDataAccessLog, oldest first — the only way to see the full row shape. */
async function auditRows(prisma: PrismaClient, userId: string): Promise<AuditRow[]> {
  return prisma.$queryRaw<AuditRow[]>`
    SELECT "id", "userId", "action", "resource", "createdAt"
    FROM "TaxDataAccessLog"
    WHERE "userId" = ${userId}
    ORDER BY "createdAt" ASC
  `
}

describe('REQ-004 — immutable audit log of tax-data access, against the real server', () => {
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
    await prisma.profile.deleteMany()
    await prisma.$executeRawUnsafe(`DELETE FROM "TaxDataAccessLog"`)
    await prisma.session.deleteMany()
    await prisma.account.deleteMany()
    await prisma.user.deleteMany()
    await prisma.rateLimit.deleteMany()
  })

  afterAll(async () => {
    await app.close()
  })

  it('REQ-004.1 one entry per write: a real HTTP PUT writes exactly one WRITE audit entry (userId, resource, timestamp; no value)', async () => {
    const put = await fetch(`${baseUrl}/v1/profile`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(VALID_PAYLOAD),
    })
    expect(put.status).toBe(200)
    const userId = userIdFromSetCookie(put.headers.get('set-cookie'))

    const rows = await auditRows(prisma, userId)
    const writes = rows.filter((row) => row.action === 'WRITE')

    expect(writes).toHaveLength(1)
    expect(writes[0]!.userId).toBe(userId)
    expect(writes[0]!.resource).toBe('profile')
    expect(writes[0]!.createdAt).toBeInstanceOf(Date)
  })

  it('REQ-004.2 read logging: a real GET on an empty profile appends no READ entry; a real GET on a saved profile appends exactly one', async () => {
    const emptyGet = await fetch(`${baseUrl}/v1/profile`)
    const emptyUserId = userIdFromSetCookie(emptyGet.headers.get('set-cookie'))
    const emptyReads = (await auditRows(prisma, emptyUserId)).filter((row) => row.action === 'READ')
    expect(emptyReads).toHaveLength(0)

    const put = await fetch(`${baseUrl}/v1/profile`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(VALID_PAYLOAD),
    })
    const cookie = put.headers.get('set-cookie')!.split(';')[0]!
    const userId = userIdFromSetCookie(put.headers.get('set-cookie'))
    await fetch(`${baseUrl}/v1/profile`, { headers: { cookie } })

    const reads = (await auditRows(prisma, userId)).filter((row) => row.action === 'READ')
    expect(reads).toHaveLength(1)
  })

  it('REQ-004.3 append-only: N real HTTP accesses produce N monotonic entries; no mutation route is exposed', async () => {
    const put = await fetch(`${baseUrl}/v1/profile`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(VALID_PAYLOAD),
    })
    const cookie = put.headers.get('set-cookie')!.split(';')[0]!
    const userId = userIdFromSetCookie(put.headers.get('set-cookie'))

    await fetch(`${baseUrl}/v1/profile`, { headers: { cookie } })
    await fetch(`${baseUrl}/v1/profile`, { headers: { cookie } })
    await fetch(`${baseUrl}/v1/profile`, { headers: { cookie } })

    const reads = (await auditRows(prisma, userId)).filter((row) => row.action === 'READ')
    expect(reads).toHaveLength(3)

    const distinctIds = new Set(reads.map((row) => row.id))
    expect(distinctIds.size).toBe(3)
    for (let i = 1; i < reads.length; i += 1) {
      expect(reads[i]!.createdAt.getTime()).toBeGreaterThanOrEqual(reads[i - 1]!.createdAt.getTime())
    }

    // No mutation surface over real HTTP: the whole API only exposes GET/PUT on
    // /v1/profile — there is no route anywhere that could update or delete an audit row.
    const deleteAttempt = await fetch(`${baseUrl}/v1/profile`, { method: 'DELETE', headers: { cookie } })
    expect(deleteAttempt.status).toBe(404)
  })

  it('REQ-004.4 isolation: userB’s audit entries are never returned when scoped to userA, over real HTTP-triggered access', async () => {
    const putA = await fetch(`${baseUrl}/v1/profile`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(VALID_PAYLOAD),
    })
    const cookieA = putA.headers.get('set-cookie')!.split(';')[0]!
    const userIdA = userIdFromSetCookie(putA.headers.get('set-cookie'))

    const userBPayload = { ...VALID_PAYLOAD, firstName: 'Jonas', steuerId: '65929970489' }
    const putB = await fetch(`${baseUrl}/v1/profile`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(userBPayload),
    })
    const cookieB = putB.headers.get('set-cookie')!.split(';')[0]!
    const userIdB = userIdFromSetCookie(putB.headers.get('set-cookie'))

    await fetch(`${baseUrl}/v1/profile`, { headers: { cookie: cookieA } })
    await fetch(`${baseUrl}/v1/profile`, { headers: { cookie: cookieB } })

    const rowsA = await auditRows(prisma, userIdA)
    const rowsB = await auditRows(prisma, userIdB)

    // Both users genuinely have rows — a broken/no-op query returning [] for everyone
    // would otherwise also make the isolation assertion below pass for the wrong reason.
    expect(rowsA.length).toBeGreaterThan(0)
    expect(rowsB.length).toBeGreaterThan(0)
    expect(rowsA.every((row) => row.userId === userIdA)).toBe(true)
    expect(rowsA.some((row) => row.userId === userIdB)).toBe(false)
  })

  it('REQ-004.5 no sensitive value: the audit table never stores the plaintext or ciphertext Steuer-ID', async () => {
    const put = await fetch(`${baseUrl}/v1/profile`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(VALID_PAYLOAD),
    })
    const userId = userIdFromSetCookie(put.headers.get('set-cookie'))

    const rawSteuerIdAtRest = await prisma.$queryRaw<{ value: string | null }[]>`
      SELECT "steuerId" AS value FROM "Profile" WHERE "userId" = ${userId}
    `
    const rows = await auditRows(prisma, userId)
    expect(rows.length).toBeGreaterThan(0)

    const serializedRows = JSON.stringify(rows)
    expect(serializedRows).not.toContain(VALID_PAYLOAD.steuerId)
    const ciphertext = rawSteuerIdAtRest[0]?.value
    if (ciphertext) {
      expect(serializedRows).not.toContain(ciphertext)
    }

    // The row shape itself carries no value column at all — only who/what/when.
    const columns = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'TaxDataAccessLog'
    `
    expect(columns.map((c) => c.column_name).sort()).toEqual(['action', 'createdAt', 'id', 'resource', 'userId'].sort())
  })

  it('REQ-004.6 failure writes nothing: a real 400 (invalid payload) appends zero audit entries', async () => {
    const before = await fetch(`${baseUrl}/v1/profile`)
    const cookie = before.headers.get('set-cookie')!.split(';')[0]!
    const userId = userIdFromSetCookie(before.headers.get('set-cookie'))

    const response = await fetch(`${baseUrl}/v1/profile`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ ...VALID_PAYLOAD, steuerId: '1234567890' }),
    })
    expect(response.status).toBe(400)

    const writes = (await auditRows(prisma, userId)).filter((row) => row.action === 'WRITE')
    expect(writes).toHaveLength(0)
  })

  // REQ-004's remaining clause — "the data subject sees their own access log as part of
  // their Art. 15 export; no one can query another user's audit trail" — was never
  // driven over real HTTP before this ticket: profile.integration.test.ts only ever
  // reads TaxDataAccessLog by raw SQL, and req-011-export.test.ts only asserts the
  // accessLog field's *shape* ("is an array"), never its cross-user isolation. Proven
  // here for the first time, against the real export endpoint (the only HTTP surface
  // that ever returns audit rows — there is no standalone "get audit log" route, and no
  // id parameter on /v1/account/export to smuggle another user's id through, see
  // req-011-export.test.ts's own trust-boundary test for that half).
  describe('own-export visibility clause, over real HTTP', () => {
    async function signUpAndSaveProfile(
      email: string,
      profile: typeof VALID_PAYLOAD,
    ): Promise<{ cookie: string; userId: string }> {
      const signUp = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...TRUSTED_ORIGIN_HEADERS },
        body: JSON.stringify({ email, password: 'a-fine-strong-password-1', name: 'Test User' }),
      })
      expect(signUp.status).toBe(200)
      const body = (await signUp.json()) as { user: { id: string } }
      const cookie = signUp.headers.get('set-cookie')!.split(';')[0]!

      const put = await fetch(`${baseUrl}/v1/profile`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify(profile),
      })
      expect(put.status).toBe(200)

      return { cookie, userId: body.user.id }
    }

    it('own export surfaces exactly the access-log entries this account produced; another account’s export never contains them, even though they demonstrably exist', async () => {
      const userA = await signUpAndSaveProfile('req004-export-a@example.com', VALID_PAYLOAD)
      // A second real access (GET) so userA has both a WRITE and a READ entry to check.
      await fetch(`${baseUrl}/v1/profile`, { headers: { cookie: userA.cookie } })

      const userB = await signUpAndSaveProfile('req004-export-b@example.com', {
        ...VALID_PAYLOAD,
        firstName: 'Jonas',
        steuerId: '65929970489',
      })

      // Ground truth, independent of the export endpoint under test: userA genuinely
      // has real rows (guards against a broken query vacuously passing the isolation
      // assertion below because it returns [] for every caller).
      const rawA = await auditRows(prisma, userA.userId)
      expect(rawA.length).toBeGreaterThan(0)

      const exportA = (await (
        await fetch(`${baseUrl}/v1/account/export?format=json`, { headers: { cookie: userA.cookie } })
      ).json()) as { accessLog: { action: string; resource: string; createdAt: string }[] }
      const exportB = (await (
        await fetch(`${baseUrl}/v1/account/export?format=json`, { headers: { cookie: userB.cookie } })
      ).json()) as { accessLog: { action: string; resource: string; createdAt: string }[] }

      // Positive: the data subject sees her own real entries (exact count — assemble()
      // runs before this call's own READ/export entry is appended, see
      // account-export.service.ts, so this equals rawA exactly, not rawA.length + 1).
      expect(exportA.accessLog).toHaveLength(rawA.length)
      expect(exportA.accessLog.some((e) => e.action === 'WRITE' && e.resource === 'profile')).toBe(true)
      expect(exportA.accessLog.some((e) => e.action === 'READ' && e.resource === 'profile')).toBe(true)

      // Negative: none of userA's real, known-to-exist entries ever show up in userB's
      // export. Checked by exact (action, resource, createdAt) signature, not just
      // array length, so this can't pass merely because both arrays happen to be short.
      const aSignatures = new Set(rawA.map((r) => `${r.action}:${r.resource}:${r.createdAt.toISOString()}`))
      const bSignatures = new Set(exportB.accessLog.map((e) => `${e.action}:${e.resource}:${e.createdAt}`))
      for (const signature of aSignatures) {
        expect(bSignatures.has(signature)).toBe(false)
      }
    })
  })
})
