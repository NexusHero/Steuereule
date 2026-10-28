// ADR-0050 — the Formular-Ausdruck end to end against the real server and Postgres:
// every gate answers honestly (guest 401, unknown year 404, unpaid 402, incomplete 422
// naming the gaps), and a complete, paid year downloads the filled Vordrucke.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { PDFDocument } from 'pdf-lib'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { resetRateLimiters } from '../support/reset-rate-limiters.js'

process.env.GUEST_SESSION_SECRET = 'ausdruck-secret'
process.env.BETTER_AUTH_SECRET = 'ausdruck-better-auth-secret-0123456789'
process.env.BETTER_AUTH_URL = 'http://127.0.0.1:39995'
const ALLOWED_ORIGIN = 'https://allowed.example.com'
process.env.CORS_ALLOWED_ORIGINS = ALLOWED_ORIGIN

const STAMMDATEN = {
  geburtsdatum: '1990-04-12',
  strasse: 'Musterstraße',
  hausnummer: '12',
  plz: '01067',
  wohnort: 'Dresden',
  religion: 'VD',
  religionEinwilligung: true,
  familienstand: 'ledig',
  iban: 'DE89370400440532013000',
  finanzamt: 'Dresden-Nord',
}

describe('Formular-Ausdruck (ADR-0050), against the real server', () => {
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
    for (const tabelle of ['Stammdaten', 'Lstb', 'Profile', 'Freischaltung', 'TaxDataAccessLog']) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${tabelle}"`)
    }
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

  async function put(cookie: string, pfad: string, body: unknown): Promise<void> {
    const response = await fetch(`${baseUrl}${pfad}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(body),
    })
    expect(response.status).toBe(200)
  }

  async function vollstaendig(cookie: string): Promise<void> {
    await put(cookie, '/v1/profile', { firstName: 'Anna', lastName: 'Beispiel', steuerId: '02476291358' })
    await put(cookie, '/v1/stammdaten', STAMMDATEN)
    await put(cookie, '/v1/steuerjahre/2025/lstb/bruttoarbeitslohn', { kind: 'erfasst', wert: 42000 })
  }

  async function bezahle(userId: string): Promise<void> {
    await prisma.freischaltung.create({
      data: { userId, steuerjahr: 2025, stripeCheckoutSessionId: `cs_${userId}`, status: 'bezahlt', bezahltAm: new Date() },
    })
  }

  const ausdruck = (cookie: string, jahr = 2025) => fetch(`${baseUrl}/v1/steuerjahre/${jahr}/ausdruck`, { headers: { cookie } })

  it('a complete, paid year downloads ESt 1 A + Anlage N as one PDF, and the access is audited', async () => {
    const { cookie, userId } = await signUp('ausdruck-ok@example.com')
    await vollstaendig(cookie)
    await bezahle(userId)

    const response = await ausdruck(cookie)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/pdf')
    expect(response.headers.get('content-disposition')).toContain('steuererklaerung-2025.pdf')
    const pdf = await PDFDocument.load(new Uint8Array(await response.arrayBuffer()))
    expect(pdf.getPageCount()).toBe(6)
    expect(await prisma.taxDataAccessLog.count({ where: { userId, resource: 'ausdruck' } })).toBe(1)
  })

  it('unpaid: 402, nothing rendered', async () => {
    const { cookie } = await signUp('ausdruck-unbezahlt@example.com')
    await vollstaendig(cookie)
    expect((await ausdruck(cookie)).status).toBe(402)
  })

  it('paid but incomplete: 422 naming exactly what is missing', async () => {
    const { cookie, userId } = await signUp('ausdruck-fehlend@example.com')
    await put(cookie, '/v1/profile', { firstName: 'Anna', lastName: 'Beispiel' })
    await bezahle(userId)

    const response = await ausdruck(cookie)
    expect(response.status).toBe(422)
    const body = (await response.json()) as { fehlend: string[] }
    expect(body.fehlend).toEqual(['steuerId', 'geburtsdatum', 'strasse', 'hausnummer', 'plz', 'wohnort', 'religion', 'familienstand', 'iban', 'finanzamt'])
  })

  it('a year without measured templates is a 404, not an empty PDF', async () => {
    const { cookie } = await signUp('ausdruck-jahr@example.com')
    expect((await ausdruck(cookie, 2024)).status).toBe(404)
  })

  it('a pension is printed on Anlage R: ESt 1 A + Anlage N + Anlage R = 8 pages', async () => {
    const { cookie, userId } = await signUp('ausdruck-rente@example.com')
    await vollstaendig(cookie)
    await prisma.rente.create({ data: { userId, steuerjahr: 2025, rentenart: 'GesetzlicheRente', jahresbetrag: '14400' } })
    await bezahle(userId)

    const pdf = await PDFDocument.load(new Uint8Array(await (await ausdruck(cookie)).arrayBuffer()))
    expect(pdf.getPageCount()).toBe(8)
    await prisma.rente.deleteMany({ where: { userId } })
  })

  it('the pre-check names an Anlage that is not printable yet, and checkout refuses before anyone pays', async () => {
    const { cookie, userId } = await signUp('ausdruck-vermietung@example.com')
    await vollstaendig(cookie)
    await prisma.vermietungsobjekt.create({ data: { userId, steuerjahr: 2025 } })

    const pruefung = await fetch(`${baseUrl}/v1/steuerjahre/2025/ausdruck/pruefung`, { headers: { cookie } })
    expect(await pruefung.json()).toEqual({ fehlend: ['anlageV'] })

    const checkout = await fetch(`${baseUrl}/v1/steuerjahre/2025/ausdruck/checkout`, { method: 'POST', headers: { cookie } })
    expect(checkout.status).toBe(422)
    expect(await prisma.freischaltung.count({ where: { userId } })).toBe(0)
    await prisma.vermietungsobjekt.deleteMany({ where: { userId } })
  })

  it('a guest session cannot download', async () => {
    expect((await fetch(`${baseUrl}/v1/steuerjahre/2025/ausdruck`)).status).toBe(401)
  })
})
