// REQ-032 — Herkunft und Bestätigung je Feld (ADR-0052 §6/§7), against the real server and
// Postgres. The only non-user writer before the assistant (17.3) is the Jahresübernahme, so it
// drives the scenarios: unconfirmed values block Vorprüfung and Checkout like missing ones, the
// user's own value wins (the copy becomes a proposal), confirming an Anlage lifts its block, and
// everything is scoped to the caller, ciphertext at rest and part of the Art. 15/20 export.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { resetRateLimiters } from '../support/reset-rate-limiters.js'

process.env.GUEST_SESSION_SECRET = 'req-032-secret'
process.env.BETTER_AUTH_SECRET = 'req-032-better-auth-secret-0123456789'
process.env.BETTER_AUTH_URL = 'http://127.0.0.1:39981'
const ALLOWED_ORIGIN = 'https://allowed.example.com'
process.env.CORS_ALLOWED_ORIGINS = ALLOWED_ORIGIN

const LAST_YEAR = 2024
const YEAR = 2025

interface Overview {
  annexes: { anlage: string; unconfirmed: number; values: { key: string; value: string | null; provenance: { art: string; vorjahr?: number }; bestaetigt: boolean; proposal: { value: string | null } | null }[] }[]
}

describe('REQ-032 — Herkunft und Bestätigung (ADR-0052 §6/§7), against the real server', () => {
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
    for (const table of ['Kennzeichnung', 'Lstb', 'Kapital', 'Rente', 'Vermietungsobjekt', 'Profile', 'Stammdaten', 'Freischaltung', 'TaxDataAccessLog']) {
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

  function put(cookie: string, path: string, body?: unknown) {
    return fetch(`${baseUrl}/v1/steuerjahre/${path}`, {
      method: 'PUT',
      headers: body === undefined ? { cookie } : { 'content-type': 'application/json', cookie },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  }

  async function missing(cookie: string): Promise<string[]> {
    const response = await fetch(`${baseUrl}/v1/steuerjahre/${YEAR}/ausdruck/pruefung`, { headers: { cookie } })
    expect(response.status).toBe(200)
    return ((await response.json()) as { missing: string[] }).missing
  }

  async function overview(cookie: string): Promise<Overview> {
    const response = await fetch(`${baseUrl}/v1/steuerjahre/${YEAR}/bestaetigung`, { headers: { cookie } })
    expect(response.status).toBe(200)
    return (await response.json()) as Overview
  }

  async function lastYearAndOwnValue(cookie: string) {
    expect((await put(cookie, `${LAST_YEAR}/lstb/bruttoarbeitslohn`, { kind: 'erfasst', value: 50000 })).status).toBe(200)
    expect((await put(cookie, `${LAST_YEAR}/lstb/lohnsteuer`, { kind: 'erfasst', value: 8000 })).status).toBe(200)
    expect((await put(cookie, `${LAST_YEAR}/kapital/kapitalertraege`, { kind: 'erfasst', value: 300 })).status).toBe(200)
    // The user already typed this year's gross wage themselves.
    expect((await put(cookie, `${YEAR}/lstb/bruttoarbeitslohn`, { kind: 'erfasst', value: 52000 })).status).toBe(200)
    const takeover = await fetch(`${baseUrl}/v1/steuerjahre/${YEAR}/uebernahme?von=${LAST_YEAR}`, { method: 'POST', headers: { cookie } })
    expect(takeover.status).toBe(200)
  }

  it('GWT — unbestätigt sperrt wie offen, der Nutzer gewinnt, Bestätigen je Anlage hebt die Sperre', async () => {
    const { cookie, userId } = await signUp('req-032-gwt@example.com')
    await lastYearAndOwnValue(cookie)

    // The user's own value stayed; the copied one is a proposal.
    const lstb = (await (await fetch(`${baseUrl}/v1/steuerjahre/${YEAR}/lstb`, { headers: { cookie } })).json()) as { bruttoarbeitslohn: unknown; lohnsteuer: unknown }
    expect(lstb.bruttoarbeitslohn).toEqual({ kind: 'erfasst', value: 52000 })
    expect(lstb.lohnsteuer).toEqual({ kind: 'erfasst', value: 8000 })

    expect(await missing(cookie)).toEqual(expect.arrayContaining(['unbestaetigt.anlageN', 'unbestaetigt.anlageKap']))
    const checkout = await fetch(`${baseUrl}/v1/steuerjahre/${YEAR}/ausdruck/checkout`, { method: 'POST', headers: { cookie } })
    expect(checkout.status).toBe(422)
    expect(((await checkout.json()) as { missing: string[] }).missing).toContain('unbestaetigt.anlageN')

    const before = await overview(cookie)
    expect(before.annexes.map((a) => a.anlage)).toEqual(['anlageN', 'anlageKap'])
    const annexN = before.annexes[0]!
    expect(annexN.unconfirmed).toBe(1)
    expect(annexN.values).toEqual([
      expect.objectContaining({ key: 'lstb.bruttoarbeitslohn', value: '52000', provenance: { art: 'nutzer' }, bestaetigt: true, proposal: expect.objectContaining({ value: '50000' }) }),
      expect.objectContaining({ key: 'lstb.lohnsteuer', value: '8000', provenance: { art: 'uebernahme', vorjahr: LAST_YEAR }, bestaetigt: false, proposal: null }),
    ])

    // Ciphertext at rest (ADR-0008): the proposal is never stored as plaintext.
    const rows = await prisma.$queryRaw<Array<{ vorschlagWert: string | null }>>`SELECT "vorschlagWert" FROM "Kennzeichnung" WHERE "userId" = ${userId} AND "postenKey" = 'lstb.bruttoarbeitslohn'`
    expect(rows[0]?.vorschlagWert).toBeTruthy()
    expect(rows[0]?.vorschlagWert).not.toContain('50000')

    // Accept the proposal → written into the mask.
    expect((await put(cookie, `${YEAR}/bestaetigung/vorschlaege/lstb.bruttoarbeitslohn`, { decision: 'annehmen' })).status).toBe(200)
    const lstbAfter = (await (await fetch(`${baseUrl}/v1/steuerjahre/${YEAR}/lstb`, { headers: { cookie } })).json()) as { bruttoarbeitslohn: unknown }
    expect(lstbAfter.bruttoarbeitslohn).toEqual({ kind: 'erfasst', value: 50000 })

    // Confirm Anlage N → its block goes, Anlage KAP's stays.
    expect((await put(cookie, `${YEAR}/bestaetigung/anlagen/anlageN`)).status).toBe(200)
    const afterN = await missing(cookie)
    expect(afterN).not.toContain('unbestaetigt.anlageN')
    expect(afterN).toContain('unbestaetigt.anlageKap')

    // Changing a value yourself is confirming it.
    expect((await put(cookie, `${YEAR}/kapital/kapitalertraege`, { kind: 'erfasst', value: 310 })).status).toBe(200)
    expect((await missing(cookie)).filter((k) => k.startsWith('unbestaetigt.'))).toEqual([])
    expect(await overview(cookie)).toEqual({ annexes: [] })
  })

  it('Herkunft und Bestätigungsstand sind Teil des Art.-15/20-Exports (entschlüsselt)', async () => {
    const { cookie, userId } = await signUp('req-032-export@example.com')
    await lastYearAndOwnValue(cookie)

    const { TAX_DATA_EXPORT_REPOSITORY } = await import('../../src/account/tax-data-export.repository.js')
    const repository = app.get<{ findAllForUser(userId: string): Promise<{ area: string; fields: Record<string, unknown> }[]> }>(TAX_DATA_EXPORT_REPOSITORY)
    const entries = (await repository.findAllForUser(userId)).filter((e) => e.area === 'Herkunft und Bestätigung')
    expect(entries.find((e) => e.fields.postenKey === 'lstb.bruttoarbeitslohn')?.fields).toMatchObject({
      herkunftArt: 'nutzer',
      bestaetigt: true,
      vorschlagHerkunftArt: 'uebernahme',
      vorschlagWert: '50000',
    })
    expect(entries.find((e) => e.fields.postenKey === 'lstb.lohnsteuer')?.fields).toMatchObject({ herkunftArt: 'uebernahme', vorjahr: LAST_YEAR, bestaetigt: false })
  })

  it('a guest gets 401 on every Bestätigung endpoint', async () => {
    expect((await fetch(`${baseUrl}/v1/steuerjahre/${YEAR}/bestaetigung`)).status).toBe(401)
    expect((await fetch(`${baseUrl}/v1/steuerjahre/${YEAR}/bestaetigung/anlagen/anlageN`, { method: 'PUT' })).status).toBe(401)
    const proposal = await fetch(`${baseUrl}/v1/steuerjahre/${YEAR}/bestaetigung/vorschlaege/lstb.lohnsteuer`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'annehmen' }),
    })
    expect(proposal.status).toBe(401)
  })

  it('isolation — another account can neither see, confirm nor decide on someone else\'s values', async () => {
    const a = await signUp('req-032-a@example.com')
    const b = await signUp('req-032-b@example.com')
    await lastYearAndOwnValue(a.cookie)

    expect(await overview(b.cookie)).toEqual({ annexes: [] })
    expect((await put(b.cookie, `${YEAR}/bestaetigung/anlagen/anlageN`)).status).toBe(200)
    expect((await put(b.cookie, `${YEAR}/bestaetigung/vorschlaege/lstb.bruttoarbeitslohn`, { decision: 'annehmen' })).status).toBe(404)

    expect(await missing(a.cookie)).toContain('unbestaetigt.anlageN')
    const lstbA = (await (await fetch(`${baseUrl}/v1/steuerjahre/${YEAR}/lstb`, { headers: { cookie: a.cookie } })).json()) as { bruttoarbeitslohn: unknown }
    expect(lstbA.bruttoarbeitslohn).toEqual({ kind: 'erfasst', value: 52000 })
  })

  it('an unknown Anlage, an unknown field and a malformed decision are 400s', async () => {
    const { cookie } = await signUp('req-032-400@example.com')
    expect((await put(cookie, `${YEAR}/bestaetigung/anlagen/anlageX`)).status).toBe(400)
    expect((await put(cookie, `${YEAR}/bestaetigung/vorschlaege/gewerbe.gewinn`, { decision: 'annehmen' })).status).toBe(400)
    expect((await put(cookie, `${YEAR}/bestaetigung/vorschlaege/lstb.lohnsteuer`, { decision: 'vielleicht' })).status).toBe(400)
  })
})
