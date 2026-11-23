// ADR-0103 vulnerability 2, better-auth boundary — the absolute cap must hold on `/api/auth/*`, which the
// mounted better-auth handler serves outside UserContextGuard (Codex P1 on PR #572). Proved against the
// real server: an over-cap session's next better-auth slide clamps its expiry into the past, so better-auth
// itself expires and deletes it on the following read — a stolen, actively-used cookie cannot keep sliding.
import { describe, expect, it } from 'vitest'
import { baseUrl, prisma, signUp, useAcceptanceServer } from '../support/acceptance-server.js'
import { SESSION_ABSOLUTE_MAX_AGE_MS } from '../../src/auth/session-lifetime.js'

const ALLOWED_ORIGIN = 'https://allowed.example.com'

describe('absolute session cap at the better-auth boundary, against the real server', () => {
  useAcceptanceServer({
    env: {
      GUEST_SESSION_SECRET: 'cap-secret',
      BETTER_AUTH_SECRET: 'cap-better-auth-secret-0123456789',
      BETTER_AUTH_URL: 'http://127.0.0.1:39995',
      CORS_ALLOWED_ORIGINS: ALLOWED_ORIGIN,
    },
    cleanup: async () => {
      await prisma.session.deleteMany()
      await prisma.account.deleteMany()
      await prisma.user.deleteMany()
    },
  })

  const sessionOf = async (cookie: string): Promise<unknown> =>
    (await fetch(`${baseUrl}/api/auth/get-session`, { headers: { cookie } })).json()

  it('expires an over-cap session on its next slide, so better-auth stops honouring the cookie everywhere', async () => {
    const { cookie, userId } = await signUp('cap@example.com')

    // Age the session past the cap, and set its expiry near-now so the next read triggers a slide.
    const row = await prisma.session.findFirst({ where: { userId } })
    expect(row).not.toBeNull()
    await prisma.session.update({
      where: { id: row!.id },
      data: {
        createdAt: new Date(Date.now() - (SESSION_ABSOLUTE_MAX_AGE_MS + 24 * 60 * 60 * 1000)), // 31 days ago
        expiresAt: new Date(Date.now() + 60_000), // still valid, but due for a slide
      },
    })

    // First read is still valid and triggers the slide — which the cap hook clamps into the past.
    expect(await sessionOf(cookie)).not.toBeNull()

    const afterSlide = await prisma.session.findFirst({ where: { userId } })
    expect(afterSlide).not.toBeNull()
    expect(new Date(afterSlide!.expiresAt).getTime()).toBeLessThan(Date.now())

    // Next read: better-auth's own expiry check rejects and deletes it — the cap is enforced on /api/auth/*.
    expect(await sessionOf(cookie)).toBeNull()
  })
})
