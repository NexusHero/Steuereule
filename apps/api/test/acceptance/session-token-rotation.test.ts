// ADR-0103 vulnerability 3 — a password change must rotate the current session token and revoke the
// account's other sessions, whatever the client sent. better-auth does both only on an explicit
// `revokeOtherSessions: true`; we force it server-side in better-auth's before-hook. Proved against the
// real server (real better-auth + Postgres, never `.inject()`): without the hook the sibling session stays
// live and the current token is unchanged; with it both are handled.
import { describe, expect, it } from 'vitest'
import { baseUrl, prisma, signUp, useAcceptanceServer } from '../support/acceptance-server.js'

const ALLOWED_ORIGIN = 'https://allowed.example.com'
const PASSWORD = 'a-fine-strong-password-1'
const NEW_PASSWORD = 'an-even-stronger-password-2'

describe('session-token rotation on password change, against the real server', () => {
  useAcceptanceServer({
    env: {
      GUEST_SESSION_SECRET: 'rotation-secret',
      BETTER_AUTH_SECRET: 'rotation-better-auth-secret-0123456789',
      BETTER_AUTH_URL: 'http://127.0.0.1:39996',
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

  const signInAgain = async (email: string): Promise<string> => {
    const response = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ALLOWED_ORIGIN },
      body: JSON.stringify({ email, password: PASSWORD }),
    })
    expect(response.status).toBe(200)
    return response.headers.get('set-cookie')!.split(';')[0]!
  }

  it('rotates the current token and revokes the other sessions even when revokeOtherSessions is omitted', async () => {
    const email = 'rotation@example.com'
    const { cookie: deviceA } = await signUp(email, { password: PASSWORD })
    const deviceB = await signInAgain(email)

    expect(await sessionOf(deviceA)).not.toBeNull()
    expect(await sessionOf(deviceB)).not.toBeNull()

    // Deliberately omit revokeOtherSessions — the server must force it (origin set so better-auth's own
    // CSRF check on /api/auth/* lets the credentialed call through).
    const change = await fetch(`${baseUrl}/api/auth/change-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: deviceA, origin: ALLOWED_ORIGIN },
      body: JSON.stringify({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD }),
    })
    expect(change.status).toBe(200)

    // Rotation: a fresh token is issued and device A's old token is dead.
    const rotated = change.headers.get('set-cookie')!.split(';')[0]!
    expect(rotated).not.toBe(deviceA)
    expect(await sessionOf(rotated)).not.toBeNull()
    expect(await sessionOf(deviceA)).toBeNull()

    // Revoke-others: the second device is gone.
    expect(await sessionOf(deviceB)).toBeNull()
  })
})
