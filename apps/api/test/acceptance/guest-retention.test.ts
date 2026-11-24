// ADR-0109 — a guest's data is erased 30 days after the last write, through the account-deletion path.
// Real Postgres, real HTTP against the actual `buildApp()` boot.
import { describe, expect, it } from 'vitest'
import { app, baseUrl, prisma, useAcceptanceServer } from '../support/acceptance-server.js'
import { GuestRetentionService } from '../../src/account/guest-retention.service.js'

const ALLOWED_ORIGIN = 'https://allowed.example.com'
const DAY = 24 * 60 * 60 * 1000

describe('guest retention — against the real server', () => {
  useAcceptanceServer({
    env: {
      GUEST_SESSION_SECRET: 'guest-retention-secret',
      BETTER_AUTH_SECRET: 'guest-retention-better-auth-secret-0123456789',
      BETTER_AUTH_URL: 'http://127.0.0.1:39981',
      CORS_ALLOWED_ORIGINS: ALLOWED_ORIGIN,
    },
    cleanup: async () => {
      await prisma.guestActivity.deleteMany()
      await prisma.session.deleteMany()
      await prisma.account.deleteMany()
      await prisma.user.deleteMany()
      await prisma.profile.deleteMany()
      await prisma.$executeRawUnsafe(`DELETE FROM "TaxDataAccessLog"`)
    },
  })

  async function guestSavesProfile(): Promise<string> {
    const res = await fetch(`${baseUrl}/v1/profile`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', origin: ALLOWED_ORIGIN },
      body: JSON.stringify({ firstName: 'Gast', lastName: 'Beispiel', steuerId: '02476291358', steuernummer: null }),
    })
    expect(res.status).toBe(200)
    const cookie = res.headers.get('set-cookie')!.split(';')[0]!
    const { verifyGuestSession } = await import('../../src/auth/guest-session.js')
    return verifyGuestSession(decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1)), 'guest-retention-secret')!
  }

  it('a guest write starts the retention clock; 31 days later the sweep erases the guest, 29 days later it does not', async () => {
    const guestId = await guestSavesProfile()
    expect(await prisma.guestActivity.findUnique({ where: { userId: guestId } })).not.toBeNull()
    const sweep = () => app.get(GuestRetentionService, { strict: false }).run(new Date(Date.now() + 40 * DAY))

    await prisma.guestActivity.update({ where: { userId: guestId }, data: { lastWriteAt: new Date(Date.now() - 29 * DAY) } })
    await app.get(GuestRetentionService, { strict: false }).run(new Date())
    expect(await prisma.profile.count({ where: { userId: guestId } })).toBe(1)

    await prisma.guestActivity.update({ where: { userId: guestId }, data: { lastWriteAt: new Date(Date.now() - 31 * DAY) } })
    await sweep()
    expect(await prisma.profile.count({ where: { userId: guestId } })).toBe(0)
    expect(await prisma.guestActivity.findUnique({ where: { userId: guestId } })).toBeNull()
  })

  it('keeps a guest whose data is under a legal hold, and an account is never swept', async () => {
    const guestId = await guestSavesProfile()
    await prisma.legalHold.create({ data: { userId: guestId, resource: 'profile', holdUntil: new Date(Date.now() + 400 * DAY) } })
    await prisma.guestActivity.update({ where: { userId: guestId }, data: { lastWriteAt: new Date(Date.now() - 45 * DAY) } })
    await app.get(GuestRetentionService, { strict: false }).run(new Date(Date.now() + 2 * DAY))
    expect(await prisma.profile.count({ where: { userId: guestId } })).toBe(1)
    await prisma.legalHold.deleteMany({ where: { userId: guestId } })
  })
})
