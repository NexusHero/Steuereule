// P6 of the beta review — account and security, against the real server and a real Postgres.
//   API-1   approving a device needs a step-up, and the minted session is neither fresh nor longer-lived.
//   H2-19   the better-auth endpoints of the step-up rule refuse a stale session.
//   API-12  joining a coupling needs a step-up; API-8 one code, one redeemer.
//   API-3   a later year of the link shows A nothing of B until B agrees in B's own app.
//   WEB-22  the session list carries no token; a session is revoked by its id.
//   H2-17   the consent screen's client lookup creates no guest and does not echo the id.
import { describe, expect, it } from 'vitest'
import { baseUrl, prisma, signUp, useAcceptanceServer } from '../support/acceptance-server.js'
import { BETTER_AUTH_STEP_UP } from '../../src/auth/step-up-policy.js'

const ORIGIN = 'https://allowed.example.com'
const PASSWORD = 'a-fine-strong-password-1'
const STALE = () => new Date(Date.now() - 10 * 60 * 1000)

const TABLES = ['SteuerjahrKopplung', 'PartnerVerknuepfung', 'HaushaltJahr', 'HaushaltPerson', 'HaushaltDublette', 'DeviceCode', 'Passkey', 'Profile', 'Stammdaten', 'TaxDataAccessLog']

describe('P6 — account and security', () => {
  useAcceptanceServer({
    env: {
      GUEST_SESSION_SECRET: 'p6-account-security-secret',
      BETTER_AUTH_SECRET: 'p6-account-security-better-auth-secret-0123456789',
      BETTER_AUTH_URL: 'http://127.0.0.1:39986',
      CORS_ALLOWED_ORIGINS: ORIGIN,
    },
    cleanup: async () => {
      for (const table of TABLES) await prisma.$executeRawUnsafe(`DELETE FROM "${table}"`).catch(() => {})
      await prisma.session.deleteMany()
      await prisma.account.deleteMany()
      await prisma.verification.deleteMany()
      await prisma.user.deleteMany()
    },
  })

  const json = (cookie: string, body: unknown, method = 'POST'): RequestInit => ({
    method,
    headers: { cookie, 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify(body),
  })
  const makeStale = (userId: string) => prisma.session.updateMany({ where: { userId }, data: { createdAt: STALE() } })
  const verifyPassword = (cookie: string) => fetch(`${baseUrl}/api/auth/verify-password`, json(cookie, { password: PASSWORD }))

  it('H2-19: every better-auth endpoint of the step-up rule refuses a stale session', async () => {
    const { cookie, userId } = await signUp('p6-stale-auth@example.com')
    await makeStale(userId)
    const reachable = Object.keys(BETTER_AUTH_STEP_UP).filter((path) => !['/change-email', '/delete-user', '/delete-user/callback', '/oauth2/consent'].includes(path))
    for (const path of reachable) {
      const method = path === '/token' || path === '/passkey/generate-register-options' ? 'GET' : 'POST'
      const response = await fetch(`${baseUrl}/api/auth${path}`, method === 'GET' ? { headers: { cookie } } : json(cookie, {}))
      expect(response.status, path).toBe(403)
      expect(((await response.json()) as { code?: string }).code, path).toBe('FRESH_AUTH_REQUIRED')
    }
  })

  async function mintCode(): Promise<{ userCode: string; deviceCode: string }> {
    const response = await fetch(`${baseUrl}/v1/device/code`, { method: 'POST', headers: { 'user-agent': 'Desktop/1.0' } })
    expect(response.status).toBe(201)
    return (await response.json()) as { userCode: string; deviceCode: string }
  }

  it('API-1: a stale session cannot approve a device; after a step-up the minted session keeps the approver’s clock', async () => {
    const { cookie, userId } = await signUp('p6-device@example.com')
    const approverCreatedAt = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000)
    await prisma.session.updateMany({ where: { userId }, data: { createdAt: approverCreatedAt } })
    const code = await mintCode()
    await fetch(`${baseUrl}/v1/device/pending?userCode=${code.userCode}`, { headers: { cookie } })

    const refused = await fetch(`${baseUrl}/v1/device/approve`, json(cookie, { userCode: code.userCode }))
    expect(refused.status).toBe(400)
    expect(((await refused.json()) as { code?: string }).code).toBe('FRESH_AUTH_REQUIRED')

    expect((await verifyPassword(cookie)).status).toBe(200)
    const approved = await fetch(`${baseUrl}/v1/device/approve`, json(cookie, { userCode: code.userCode }))
    expect(approved.status).toBe(200)

    const token = await fetch(`${baseUrl}/v1/device/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'Desktop/1.0' },
      body: JSON.stringify({ deviceCode: code.deviceCode }),
    })
    expect(token.status).toBe(200)
    const desktopCookie = token.headers.get('set-cookie')!.split(';')[0]!
    const rawToken = decodeURIComponent(desktopCookie.split('=')[1]!).split('.')[0]!
    const minted = await prisma.session.findUniqueOrThrow({ where: { token: rawToken } })
    expect(minted.createdAt.toISOString()).toBe(approverCreatedAt.toISOString())
    expect(minted.expiresAt.getTime()).toBeLessThanOrEqual(approverCreatedAt.getTime() + 30 * 24 * 60 * 60 * 1000)

    // The minted session is not fresh: it cannot register a passkey or approve a further device by itself.
    const passkey = await fetch(`${baseUrl}/api/auth/passkey/generate-register-options`, { headers: { cookie: desktopCookie } })
    expect(passkey.status).toBe(403)
  })

  it('WEB-22: the session list has no tokens, and a session is revoked by its id', async () => {
    const { cookie } = await signUp('p6-sessions@example.com')
    const second = await fetch(`${baseUrl}/api/auth/sign-in/email`, json('', { email: 'p6-sessions@example.com', password: PASSWORD }))
    const secondCookie = second.headers.get('set-cookie')!.split(';')[0]!

    const list = await fetch(`${baseUrl}/api/auth/list-sessions`, { headers: { cookie } })
    const sessions = (await list.json()) as { id: string; token?: string }[]
    expect(sessions.length).toBe(2)
    for (const session of sessions) expect(session.token).toBeUndefined()

    const current = (await (await fetch(`${baseUrl}/api/auth/get-session`, { headers: { cookie: secondCookie } })).json()) as { session: { id: string } }
    const revoke = await fetch(`${baseUrl}/api/auth/revoke-session`, json(cookie, { token: current.session.id }))
    expect(revoke.status).toBe(200)
    expect(await (await fetch(`${baseUrl}/api/auth/get-session`, { headers: { cookie: secondCookie } })).json()).toBeNull()
    expect(await (await fetch(`${baseUrl}/api/auth/get-session`, { headers: { cookie } })).json()).not.toBeNull()
  })

  async function invitation(cookieA: string, year: number): Promise<string> {
    const response = await fetch(`${baseUrl}/v1/steuerjahre/${year}/kopplung`, json(cookieA, { filingType: 'zusammen' }, 'PUT'))
    expect(response.status).toBe(200)
    return ((await response.json()) as { invitationCode: string }).invitationCode
  }

  it('API-12/API-8: joining needs a step-up, and of two redeemers of one code exactly one wins', async () => {
    const a = await signUp('p6-a@example.com')
    const b = await signUp('p6-b@example.com')
    const c = await signUp('p6-c@example.com')
    const code = await invitation(a.cookie, 2025)

    await makeStale(b.userId)
    const refused = await fetch(`${baseUrl}/v1/steuerjahre/2025/kopplung/beitreten/${code}`, json(b.cookie, {}))
    expect(refused.status).toBe(400)
    expect(((await refused.json()) as { code?: string }).code).toBe('FRESH_AUTH_REQUIRED')

    expect((await verifyPassword(b.cookie)).status).toBe(200)
    const [first, second] = await Promise.all([
      fetch(`${baseUrl}/v1/steuerjahre/2025/kopplung/beitreten/${code}`, json(b.cookie, {})),
      fetch(`${baseUrl}/v1/steuerjahre/2025/kopplung/beitreten/${code}`, json(c.cookie, {})),
    ])
    expect([first.status, second.status].sort()).toEqual([200, 404])
    const rows = await prisma.taxYearLink.findMany({ where: { personAUserId: a.userId, taxYear: 2025 } })
    expect(rows).toHaveLength(1)
    expect([b.userId, c.userId]).toContain(rows[0]!.personBUserId)
  })

  it('API-3: a later year of the link shows A nothing of B until B agrees in B’s own app', async () => {
    const a = await signUp('p6-year-a@example.com')
    const b = await signUp('p6-year-b@example.com')
    expect((await fetch(`${baseUrl}/v1/profile`, json(b.cookie, { firstName: 'Bea', lastName: 'Beispiel' }, 'PUT'))).status).toBe(200)
    const code = await invitation(a.cookie, 2025)
    expect((await fetch(`${baseUrl}/v1/steuerjahre/2025/kopplung/beitreten/${code}`, json(b.cookie, {}))).status).toBe(200)

    const next = await fetch(`${baseUrl}/v1/steuerjahre/2026/kopplung`, json(a.cookie, { filingType: 'zusammen' }, 'PUT'))
    expect(next.status).toBe(200)
    const pending = (await next.json()) as { personB: unknown; personBConsentPending: boolean }
    expect(pending.personB).toBeNull()
    expect(pending.personBConsentPending).toBe(true)

    const asked = (await (await fetch(`${baseUrl}/v1/steuerjahre/2026/kopplung`, { headers: { cookie: b.cookie } })).json()) as { consentRequestedFromMe: boolean }
    expect(asked.consentRequestedFromMe).toBe(true)
    expect((await fetch(`${baseUrl}/v1/steuerjahre/2026/kopplung/zustimmung`, json(b.cookie, {}))).status).toBe(200)

    const shared = (await (await fetch(`${baseUrl}/v1/steuerjahre/2026/kopplung`, { headers: { cookie: a.cookie } })).json()) as { personB: { firstName: string } | null; personBConsentPending: boolean }
    expect(shared.personBConsentPending).toBe(false)
    expect(shared.personB?.firstName).toBe('Bea')
  })

  it('H2-17: the client lookup sets no guest cookie, bounds the id and does not echo it', async () => {
    const missing = await fetch(`${baseUrl}/v1/oauth/client-info?clientId=%3Cscript%3Eunknown`)
    expect(missing.status).toBe(404)
    expect(missing.headers.get('set-cookie')).toBeNull()
    expect(await missing.text()).not.toContain('script')
    const long = await fetch(`${baseUrl}/v1/oauth/client-info?clientId=${'x'.repeat(500)}`)
    expect(long.status).toBe(400)
  })
})
