// ADR-0027's control proof: `session.freshAge: 0` is what lets an older session read its own device list.
//
// The claim "setting freshAge back to better-auth's default breaks the device list" is a mechanism, and a gate that
// only ever sees the fixed behaviour cannot tell whether it still guards anything (ADR-0021). This test runs both
// directions against the real better-auth handler and the real Postgres, on the SAME aged session row:
//
//   - the product instance (`freshAge: 0`, the mounted app) lists the sessions: 200;
//   - an instance built from the product's own options with `session.freshAge` removed (better-auth then applies its
//     default of 86400 s) refuses the same cookie: 403 SESSION_NOT_FRESH.
//
// Two controls keep the refusal honest: the default-freshAge instance serves a session that is NOT aged (so the 403 is
// the age, not the cookie, the origin or the setup), and the aged session is older than the default by construction.
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { app, baseUrl, prisma, signUp, useAcceptanceServer } from '../support/acceptance-server.js'

const ALLOWED_ORIGIN = 'https://allowed.example.com'
const PAST_DEFAULT_FRESH_AGE_MS = 25 * 60 * 60 * 1000

describe("ADR-0027 control proof — better-auth's default freshAge refuses an aged session's device list, the product's freshAge: 0 serves it", () => {
  useAcceptanceServer({
    env: {
      GUEST_SESSION_SECRET: 'adr-0027-control-secret',
      BETTER_AUTH_SECRET: 'adr-0027-control-better-auth-secret-0123456789',
      BETTER_AUTH_URL: 'http://127.0.0.1:39995',
      CORS_ALLOWED_ORIGINS: ALLOWED_ORIGIN,
    },
    cleanup: async () => {
      await prisma.session.deleteMany()
      await prisma.account.deleteMany()
      await prisma.user.deleteMany()
      await prisma.profile.deleteMany()
    },
  })

  /** The only part of the second instance the test uses. */
  interface AuthHandler {
    readonly handler: (request: Request) => Promise<Response>
  }
  let withDefaultFreshAge: AuthHandler

  beforeAll(async () => {
    const { betterAuth } = await import('better-auth')
    const { buildOptions } = await import('../../src/auth/better-auth.js')
    const { createResettableRateLimitStorage } = await import('../../src/auth/rate-limit-storage.js')
    const { resolveBetterAuthSecret, resolveBetterAuthUrl, resolveWebAppUrl } = await import('../../src/auth/better-auth-env.js')
    const { resolveCorsOrigins } = await import('../../src/cors/resolve-cors-origins.js')
    const { systemDatabaseClient } = await import('../../src/common/database-identity.js')
    const { ENCRYPTED_PRISMA } = await import('../../src/prisma/encrypted-prisma.provider.js')

    const options = buildOptions({
      prisma: systemDatabaseClient(app.get<PrismaClient>(ENCRYPTED_PRISMA), 'better-auth'),
      secret: resolveBetterAuthSecret(),
      baseUrl: resolveBetterAuthUrl(),
      trustedOrigins: resolveCorsOrigins(),
      webAppUrl: resolveWebAppUrl(),
      emailSender: { sendVerificationEmail: vi.fn(), sendPasswordResetEmail: vi.fn(), sendExistingAccountNotice: vi.fn(), sendUnverifiedAccountWarning: vi.fn() },
      rateLimitStorage: createResettableRateLimitStorage(),
    })
    // Guard the premise: the product really sets 0, and the mutant below differs from it in this one key only.
    expect(options.session?.freshAge).toBe(0)
    const { freshAge: _removed, ...session } = options.session ?? {}
    withDefaultFreshAge = betterAuth({ ...options, session })
  })

  const listSessions = (cookie: string, auth?: AuthHandler): Promise<Response> => {
    const headers = { cookie, origin: ALLOWED_ORIGIN }
    return auth === undefined
      ? fetch(`${baseUrl}/api/auth/list-sessions`, { headers })
      : auth.handler(new Request(`${process.env.BETTER_AUTH_URL}/api/auth/list-sessions`, { headers }))
  }

  it('[control] a session that is not aged is listed by the default-freshAge instance too, so a refusal below is the age', async () => {
    const { cookie } = await signUp('adr0027-young@example.com')

    expect((await listSessions(cookie)).status).toBe(200)
    expect((await listSessions(cookie, withDefaultFreshAge)).status).toBe(200)
  })

  it('the same aged session: refused with better-auth\'s default freshAge, listed with the product\'s freshAge: 0', async () => {
    const { cookie, userId } = await signUp('adr0027-aged@example.com')
    const aged = new Date(Date.now() - PAST_DEFAULT_FRESH_AGE_MS)
    await prisma.session.updateMany({ where: { userId }, data: { createdAt: aged, updatedAt: aged } })

    const refused = await listSessions(cookie, withDefaultFreshAge)
    expect(refused.status).toBe(403)
    expect(((await refused.json()) as { code?: string }).code).toBe('SESSION_NOT_FRESH')

    const listed = await listSessions(cookie)
    expect(listed.status).toBe(200)
    const sessions = (await listed.json()) as unknown[]
    expect(Array.isArray(sessions)).toBe(true)
    expect(sessions.length).toBeGreaterThan(0)
  })
})
