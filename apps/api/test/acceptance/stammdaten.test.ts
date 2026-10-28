// ADR-0050 — the Erklärungs-Stammdaten against the real server and Postgres: what the
// Hauptvordruck ESt 1 A needs beyond name/Steuer-ID, encrypted at rest, religion only
// with explicit Art. 9 consent, account-only.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { resetRateLimiters } from '../support/reset-rate-limiters.js'

process.env.GUEST_SESSION_SECRET = 'stammdaten-secret'
process.env.BETTER_AUTH_SECRET = 'stammdaten-better-auth-secret-0123456789'
process.env.BETTER_AUTH_URL = 'http://127.0.0.1:39995'

const ALLOWED_ORIGIN = 'https://allowed.example.com'
process.env.CORS_ALLOWED_ORIGINS = ALLOWED_ORIGIN

const VOLLSTAENDIG = {
  geburtsdatum: '1990-04-12',
  strasse: 'Musterstraße',
  hausnummer: '12',
  plz: '01067',
  wohnort: 'Dresden',
  religion: 'RK',
  religionEinwilligung: true,
  familienstand: 'ledig',
  iban: 'DE89 3704 0044 0532 0130 00',
  finanzamt: 'Dresden-Nord',
}

describe('Stammdaten (ADR-0050), against the real server', () => {
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
    resetRateLimiters(app)
    await prisma.$executeRawUnsafe(`DELETE FROM "Stammdaten"`)
    await prisma.$executeRawUnsafe(`DELETE FROM "TaxDataAccessLog"`)
    await prisma.session.deleteMany()
    await prisma.account.deleteMany()
    await prisma.user.deleteMany()
  })

  afterAll(async () => {
    await app.close()
  })

  async function signUp(email: string): Promise<{ cookie: string; userId: string }> {
    const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ALLOWED_ORIGIN },
      body: JSON.stringify({ email, password: 'a-fine-strong-password-1', name: 'Test User' }),
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { user: { id: string } }
    return { cookie: response.headers.get('set-cookie')!.split(';')[0]!, userId: body.user.id }
  }

  function put(cookie: string, body: unknown) {
    return fetch(`${baseUrl}/v1/stammdaten`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(body),
    })
  }

  it('round-trips the data, with IBAN, religion and address as ciphertext at rest', async () => {
    const { cookie, userId } = await signUp('stammdaten-roundtrip@example.com')

    const response = await put(cookie, VOLLSTAENDIG)
    expect(response.status).toBe(200)
    const read = (await (await fetch(`${baseUrl}/v1/stammdaten`, { headers: { cookie } })).json()) as Record<string, unknown>
    expect(read).toMatchObject({ iban: 'DE89370400440532013000', religion: 'RK', plz: '01067', fehlend: [] })

    const [raw] = await prisma.$queryRaw<{ iban: string; religion: string; strasse: string }[]>`
      SELECT iban, religion, strasse FROM "Stammdaten" WHERE "userId" = ${userId}`
    expect(raw!.iban).not.toContain('DE89')
    expect(raw!.religion).not.toBe('RK')
    expect(raw!.strasse).not.toContain('Muster')
  })

  it('refuses a religion without explicit consent (Art. 9 DSGVO) and writes nothing', async () => {
    const { cookie, userId } = await signUp('stammdaten-art9@example.com')
    const response = await put(cookie, { ...VOLLSTAENDIG, religionEinwilligung: undefined })
    expect(response.status).toBe(400)
    expect(await prisma.stammdaten.count({ where: { userId } })).toBe(0)
  })

  it('refuses an IBAN with a wrong check digit and an impossible date', async () => {
    const { cookie } = await signUp('stammdaten-validation@example.com')
    expect((await put(cookie, { ...VOLLSTAENDIG, iban: 'DE89370400440532013001' })).status).toBe(400)
    expect((await put(cookie, { ...VOLLSTAENDIG, geburtsdatum: '1990-02-30' })).status).toBe(400)
  })

  it('a guest session cannot read or write Stammdaten', async () => {
    const guest = await fetch(`${baseUrl}/v1/stammdaten`)
    const cookie = guest.headers.get('set-cookie')?.split(';')[0] ?? ''
    expect(guest.status).toBe(401)
    expect((await put(cookie, VOLLSTAENDIG)).status).toBe(401)
  })
})
