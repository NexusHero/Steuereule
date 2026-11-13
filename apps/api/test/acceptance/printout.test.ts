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

const MASTER_DATA = {
  geburtsdatum: '1990-04-12',
  strasse: 'Musterstraße',
  hausnummer: '12',
  plz: '01067',
  wohnort: 'Dresden',
  religion: 'VD',
  religionConsent: true,
  familienstand: 'ledig',
  iban: 'DE89370400440532013000',
  finanzamt: 'Dresden-Nord',
}

const ANNEX_V_PAGES = 4

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
    for (const table of ['Stammdaten', 'Lstb', 'Profile', 'Freischaltung', 'TaxDataAccessLog']) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${table}"`)
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

  async function put(cookie: string, path: string, body: unknown): Promise<void> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(body),
    })
    expect(response.status).toBe(200)
  }

  async function complete(cookie: string): Promise<void> {
    await put(cookie, '/v1/profile', { firstName: 'Anna', lastName: 'Beispiel', steuerId: '02476291358' })
    await put(cookie, '/v1/stammdaten', MASTER_DATA)
    await put(cookie, '/v1/steuerjahre/2025/lstb/bruttoarbeitslohn', { kind: 'erfasst', value: 42000 })
  }

  async function pay(userId: string): Promise<void> {
    await prisma.unlock.create({
      data: { userId, taxYear: 2025, stripeCheckoutSessionId: `cs_${userId}`, status: 'bezahlt', paidAt: new Date() },
    })
  }

  const printout = (cookie: string, year = 2025) => fetch(`${baseUrl}/v1/steuerjahre/${year}/ausdruck`, { headers: { cookie } })

  it('a complete, paid year downloads ESt 1 A + Anlage N as one PDF, and the access is audited', async () => {
    const { cookie, userId } = await signUp('ausdruck-ok@example.com')
    await complete(cookie)
    await pay(userId)

    const response = await printout(cookie)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/pdf')
    expect(response.headers.get('content-disposition')).toContain('steuererklaerung-2025.pdf')
    const pdf = await PDFDocument.load(new Uint8Array(await response.arrayBuffer()))
    expect(pdf.getPageCount()).toBe(6)
    expect(await prisma.taxDataAccessLog.count({ where: { userId, resource: 'ausdruck' } })).toBe(1)
  })

  it('the editable variant (?bearbeitbar=true) carries named AcroForm fields, same gates', async () => {
    const { cookie, userId } = await signUp('ausdruck-bearbeitbar@example.com')
    await complete(cookie)
    const url = `${baseUrl}/v1/steuerjahre/2025/ausdruck?bearbeitbar=true`
    expect((await fetch(url, { headers: { cookie } })).status).toBe(402)
    await pay(userId)

    const response = await fetch(url, { headers: { cookie } })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-disposition')).toContain('steuererklaerung-2025-bearbeitbar.pdf')
    const form = (await PDFDocument.load(new Uint8Array(await response.arrayBuffer()))).getForm()
    expect(form.getTextField('est1a.idnr').getText()).toMatch(/^\d{11}$/)
  })

  it('unpaid: 402, nothing rendered', async () => {
    const { cookie } = await signUp('ausdruck-unbezahlt@example.com')
    await complete(cookie)
    expect((await printout(cookie)).status).toBe(402)
  })

  it('paid but incomplete: 422 naming exactly what is missing', async () => {
    const { cookie, userId } = await signUp('ausdruck-fehlend@example.com')
    await put(cookie, '/v1/profile', { firstName: 'Anna', lastName: 'Beispiel' })
    await pay(userId)

    const response = await printout(cookie)
    expect(response.status).toBe(422)
    const body = (await response.json()) as { missing: string[] }
    expect(body.missing).toEqual(['steuerId', 'geburtsdatum', 'strasse', 'hausnummer', 'plz', 'wohnort', 'religion', 'familienstand', 'iban', 'finanzamt'])
  })

  it('a year without measured templates is a 404, not an empty PDF', async () => {
    const { cookie } = await signUp('ausdruck-jahr@example.com')
    // 2024 and 2025 are measured (ADR-0085); 2023 is not.
    expect((await printout(cookie, 2023)).status).toBe(404)
  })

  it('a pension is printed on Anlage R: ESt 1 A + Anlage N + Anlage R = 8 pages', async () => {
    const { cookie, userId } = await signUp('ausdruck-rente@example.com')
    await complete(cookie)
    await prisma.pension.create({ data: { userId, taxYear: 2025, rentenart: 'GesetzlicheRente', jahresbetrag: '14400' } })
    await pay(userId)

    const pdf = await PDFDocument.load(new Uint8Array(await (await printout(cookie)).arrayBuffer()))
    expect(pdf.getPageCount()).toBe(8)
    await prisma.pension.deleteMany({ where: { userId } })
  })

  it('rented property is printed on Anlage V, one instance per Objekt', async () => {
    const { cookie, userId } = await signUp('ausdruck-vermietung@example.com')
    await complete(cookie)
    await prisma.rentalProperty.create({
      data: { userId, taxYear: 2025, strasse: 'Hauptstraße', hausnummer: '3', plz: '01067', city: 'Dresden', mieteinnahmen: '9600', werbungskosten: '0' },
    })
    await pay(userId)

    const check = await fetch(`${baseUrl}/v1/steuerjahre/2025/ausdruck/pruefung`, { headers: { cookie } })
    expect(await check.json()).toEqual({ missing: [] })

    const pdf = await PDFDocument.load(new Uint8Array(await (await printout(cookie)).arrayBuffer()))
    expect(pdf.getPageCount()).toBe(6 + ANNEX_V_PAGES)
    await prisma.rentalProperty.deleteMany({ where: { userId } })
  })

  it('the pre-check names an Anlage that is not printable yet, and checkout refuses before anyone pays', async () => {
    const { cookie, userId } = await signUp('ausdruck-betriebsrente@example.com')
    await complete(cookie)
    await prisma.pension.create({ data: { userId, taxYear: 2025, rentenart: 'Betriebsrente', jahresbetrag: '3000' } })

    const check = await fetch(`${baseUrl}/v1/steuerjahre/2025/ausdruck/pruefung`, { headers: { cookie } })
    expect(await check.json()).toEqual({ missing: ['anlageRAvBav'] })

    const checkout = await fetch(`${baseUrl}/v1/steuerjahre/2025/ausdruck/checkout`, { method: 'POST', headers: { cookie } })
    expect(checkout.status).toBe(422)
    expect(await prisma.unlock.count({ where: { userId } })).toBe(0)
    await prisma.pension.deleteMany({ where: { userId } })
  })

  it('a guest session cannot download', async () => {
    expect((await fetch(`${baseUrl}/v1/steuerjahre/2025/ausdruck`)).status).toBe(401)
  })
})
