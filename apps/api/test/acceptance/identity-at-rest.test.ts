// ADR-0109 — who the customers are is ciphertext at rest, and better-auth still finds them by e-mail.
// Real Postgres, real HTTP against `buildApp()`.
import { describe, expect, it } from 'vitest'
import { baseUrl, prisma, useAcceptanceServer, verifyAndSignIn } from '../support/acceptance-server.js'

const ORIGIN = 'https://allowed.example.com'
const PASSWORD = 'a-fine-strong-password-1'
const CIPHERTEXT = /^v1\.aesgcm256\./

describe('ADR-0109 — identity fields at rest, against the real server', () => {
  useAcceptanceServer({
    env: {
      GUEST_SESSION_SECRET: 'identity-at-rest-secret',
      BETTER_AUTH_SECRET: 'identity-at-rest-better-auth-secret-0123456789',
      BETTER_AUTH_URL: 'http://127.0.0.1:39981',
      WEB_APP_URL: 'https://app.example.com',
      CORS_ALLOWED_ORIGINS: ORIGIN,
    },
    cleanup: async () => {
      await prisma.session.deleteMany()
      await prisma.account.deleteMany()
      await prisma.user.deleteMany()
    },
  })

  const signUp = (email: string, name = 'Anna Beispiel') =>
    fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({ email, password: PASSWORD, name }),
    })

  it('stores e-mail, name and the session address as ciphertext; sign-in by e-mail (any case) and the session read still work', async () => {
    expect((await signUp('Anna.Beispiel@Example.com')).status).toBe(200)
    const signIn = await verifyAndSignIn('ANNA.beispiel@example.com', PASSWORD, { origin: ORIGIN, headers: { 'user-agent': 'AtRestTest/1.0' } })
    expect(signIn.status).toBe(200)
    const cookie = signIn.headers.get('set-cookie')!.split(';')[0]!

    const users = await prisma.$queryRaw<{ email: string; name: string; emailHash: string }[]>`SELECT "email","name","emailHash" FROM "User"`
    expect(users).toHaveLength(1)
    expect(users[0]!.email).toMatch(CIPHERTEXT)
    expect(users[0]!.name).toMatch(CIPHERTEXT)
    expect(users[0]!.emailHash).toMatch(/^[0-9a-f]{64}$/)
    const sessions = await prisma.$queryRaw<{ ipAddress: string | null; userAgent: string | null }[]>`SELECT "ipAddress","userAgent" FROM "Session"`
    expect(sessions[0]!.userAgent).toMatch(CIPHERTEXT)

    const session = await fetch(`${baseUrl}/api/auth/get-session`, { headers: { cookie } })
    const body = (await session.json()) as { user: { email: string; name: string } }
    expect(body.user).toMatchObject({ email: 'anna.beispiel@example.com', name: 'Anna Beispiel' })
  })

  it('a second sign-up with the same address in another case creates no second account', async () => {
    await signUp('twice@example.com')
    const again = await signUp('Twice@Example.com', 'Someone Else')
    expect(again.status).toBe(200)
    expect(await prisma.user.count()).toBe(1)
  })
})
