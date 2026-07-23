// REQ-006 — guest -> account upgrade, atomic data carry-over (ADR-0012 §4). Real
// Postgres, real HTTP against the actual `buildApp()` boot (never `.inject()`).
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

const GUEST_SESSION_SECRET = 'req-006-secret'
process.env.GUEST_SESSION_SECRET = GUEST_SESSION_SECRET
process.env.BETTER_AUTH_SECRET = 'req-006-better-auth-secret-0123456789'
process.env.BETTER_AUTH_URL = 'http://127.0.0.1:39996'

const ALLOWED_ORIGIN = 'https://allowed.example.com'
process.env.CORS_ALLOWED_ORIGINS = ALLOWED_ORIGIN
// See req-005/req-009: Node's fetch() sends Sec-Fetch-Mode by default, so every
// state-changing better-auth call needs a trusted Origin, same as a real browser.
const TRUSTED_ORIGIN_HEADERS = { origin: ALLOWED_ORIGIN }

const GUEST_PROFILE = { firstName: 'Guest', lastName: 'Person', steuerId: '02476291358', steuernummer: null }

describe('REQ-006 — guest -> account upgrade, against the real server', () => {
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
    await prisma.user.deleteMany()
    await prisma.profile.deleteMany()
    await prisma.$executeRawUnsafe(`DELETE FROM "TaxDataAccessLog"`)
    // See req-005/req-009's afterEach: no forwarded client IP means the login rate
    // limiter shares one bucket across every caller in this environment.
    await prisma.rateLimit.deleteMany()
  })

  afterAll(async () => {
    await app.close()
  })

  /** Mints a guest cookie exactly as UserContextGuard would, and seeds a Profile (+ a
   *  READ audit entry) under that guest userId directly — the guest "already has data". */
  async function seedGuestWithProfile(): Promise<{ guestUserId: string; guestCookie: string }> {
    const { newGuestUserId, signGuestSession } = await import('../../src/auth/guest-session.js')
    const guestUserId = newGuestUserId()
    const guestCookie = `se_guest_session=${signGuestSession(guestUserId, GUEST_SESSION_SECRET)}`
    await prisma.profile.create({ data: { userId: guestUserId, ...GUEST_PROFILE } })
    await prisma.taxDataAccessLog.create({ data: { userId: guestUserId, action: 'READ', resource: 'profile' } })
    return { guestUserId, guestCookie }
  }

  it('a guest with a persisted profile who signs up carries everything over atomically, and the guest session is retired', async () => {
    const { guestUserId, guestCookie } = await seedGuestWithProfile()

    const signUp = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: guestCookie, ...TRUSTED_ORIGIN_HEADERS },
      body: JSON.stringify({ email: 'req006-upgrade@example.com', password: 'a-fine-strong-password-1', name: 'Upgrade Me' }),
    })
    expect(signUp.status).toBe(200)
    const body = (await signUp.json()) as { user: { id: string } }
    const accountUserId = body.user.id

    // No duplicate rows: exactly one Profile, now under the account id.
    const profiles = await prisma.profile.findMany({ where: { OR: [{ userId: guestUserId }, { userId: accountUserId }] } })
    expect(profiles).toHaveLength(1)
    expect(profiles[0]!.userId).toBe(accountUserId)
    expect(profiles[0]!.firstName).toBe(GUEST_PROFILE.firstName)

    // The guest's prior audit history moved with the data (ownership transfer, ADR-0012
    // §4's sanctioned append-only exception), plus a fresh WRITE entry records the
    // migration itself under the account id.
    const auditRows = await prisma.$queryRaw<{ userId: string; action: string }[]>`
      SELECT "userId", "action" FROM "TaxDataAccessLog" ORDER BY "createdAt" ASC
    `
    expect(auditRows.every((row) => row.userId === accountUserId)).toBe(true)
    expect(auditRows.some((row) => row.action === 'READ')).toBe(true)
    expect(auditRows.filter((row) => row.action === 'WRITE')).toHaveLength(1)

    // The guest session is retired — a Set-Cookie clears it (never left dangling to
    // resolve back to the now-spent guest identity).
    const setCookies = signUp.headers.getSetCookie()
    const guestCookieClear = setCookies.find((c) => c.startsWith('se_guest_session='))
    expect(guestCookieClear).toBeDefined()
    expect(guestCookieClear).toMatch(/Max-Age=0/)
  })

  it('a guest with no profile signs up: no-op migration, no error, guest session still retired', async () => {
    const { newGuestUserId, signGuestSession } = await import('../../src/auth/guest-session.js')
    const guestUserId = newGuestUserId()
    const guestCookie = `se_guest_session=${signGuestSession(guestUserId, GUEST_SESSION_SECRET)}`

    const signUp = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: guestCookie, ...TRUSTED_ORIGIN_HEADERS },
      body: JSON.stringify({ email: 'req006-empty-guest@example.com', password: 'a-fine-strong-password-1', name: 'No Data' }),
    })
    expect(signUp.status).toBe(200)

    const setCookies = signUp.headers.getSetCookie()
    expect(setCookies.some((c) => c.startsWith('se_guest_session=') && c.includes('Max-Age=0'))).toBe(true)
    await expect(prisma.profile.count()).resolves.toBe(0)
  })

  it('an account that already owns a profile is never clobbered by a stray guest cookie’s data (guest data left untouched)', async () => {
    // A returning account, already with its own profile from before.
    const signUp = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...TRUSTED_ORIGIN_HEADERS },
      body: JSON.stringify({ email: 'req006-returning@example.com', password: 'a-fine-strong-password-1', name: 'Returning' }),
    })
    const { user } = (await signUp.json()) as { user: { id: string } }
    await prisma.profile.create({
      data: { userId: user.id, firstName: 'Account', lastName: 'Owner', steuerId: '65929970489', steuernummer: null },
    })

    // ...who now also carries a stray guest cookie whose OWN profile predates this sign-in.
    const { guestUserId, guestCookie } = await seedGuestWithProfile()

    const signIn = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: guestCookie, ...TRUSTED_ORIGIN_HEADERS },
      body: JSON.stringify({ email: 'req006-returning@example.com', password: 'a-fine-strong-password-1' }),
    })
    expect(signIn.status).toBe(200)

    // The account's own profile is untouched...
    const accountProfile = await prisma.profile.findUnique({ where: { userId: user.id } })
    expect(accountProfile?.firstName).toBe('Account')
    // ...and the guest's profile is left exactly where it was — not merged, not deleted.
    const guestProfile = await prisma.profile.findUnique({ where: { userId: guestUserId } })
    expect(guestProfile).not.toBeNull()
    expect(guestProfile?.firstName).toBe(GUEST_PROFILE.firstName)
  })

  it('a retried upgrade is idempotent: re-running the migration after it already succeeded duplicates nothing', async () => {
    const { guestUserId } = await seedGuestWithProfile()

    const signUp = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `se_guest_session=${(await import('../../src/auth/guest-session.js')).signGuestSession(guestUserId, GUEST_SESSION_SECRET)}`,
        ...TRUSTED_ORIGIN_HEADERS,
      },
      body: JSON.stringify({ email: 'req006-idempotent@example.com', password: 'a-fine-strong-password-1', name: 'Idempotent' }),
    })
    const { user } = (await signUp.json()) as { user: { id: string } }

    const { upgradeGuestToAccount } = await import('../../src/auth/guest-account-upgrade.js')
    // Retry: the guest no longer owns a profile (already migrated), so this must be
    // a clean no-op — never a duplicate row, never an error.
    await upgradeGuestToAccount(prisma, guestUserId, user.id)
    await upgradeGuestToAccount(prisma, guestUserId, user.id)

    const profiles = await prisma.profile.findMany({ where: { userId: user.id } })
    expect(profiles).toHaveLength(1)
  })
})
