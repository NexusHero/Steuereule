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

const VORJAHR = 2024
const JAHR = 2025

interface Uebersicht {
  anlagen: { anlage: string; unbestaetigt: number; werte: { key: string; wert: string | null; herkunft: { art: string; vorjahr?: number }; bestaetigt: boolean; vorschlag: { wert: string | null } | null }[] }[]
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
    for (const tabelle of ['Kennzeichnung', 'Lstb', 'Kapital', 'Rente', 'Vermietungsobjekt', 'Profile', 'Stammdaten', 'Freischaltung', 'TaxDataAccessLog']) {
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

  function put(cookie: string, pfad: string, body?: unknown) {
    return fetch(`${baseUrl}/v1/steuerjahre/${pfad}`, {
      method: 'PUT',
      headers: body === undefined ? { cookie } : { 'content-type': 'application/json', cookie },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  }

  async function fehlend(cookie: string): Promise<string[]> {
    const response = await fetch(`${baseUrl}/v1/steuerjahre/${JAHR}/ausdruck/pruefung`, { headers: { cookie } })
    expect(response.status).toBe(200)
    return ((await response.json()) as { fehlend: string[] }).fehlend
  }

  async function uebersicht(cookie: string): Promise<Uebersicht> {
    const response = await fetch(`${baseUrl}/v1/steuerjahre/${JAHR}/bestaetigung`, { headers: { cookie } })
    expect(response.status).toBe(200)
    return (await response.json()) as Uebersicht
  }

  async function vorjahrUndEigenerWert(cookie: string) {
    expect((await put(cookie, `${VORJAHR}/lstb/bruttoarbeitslohn`, { kind: 'erfasst', wert: 50000 })).status).toBe(200)
    expect((await put(cookie, `${VORJAHR}/lstb/lohnsteuer`, { kind: 'erfasst', wert: 8000 })).status).toBe(200)
    expect((await put(cookie, `${VORJAHR}/kapital/kapitalertraege`, { kind: 'erfasst', wert: 300 })).status).toBe(200)
    // The user already typed this year's gross wage themselves.
    expect((await put(cookie, `${JAHR}/lstb/bruttoarbeitslohn`, { kind: 'erfasst', wert: 52000 })).status).toBe(200)
    const uebernahme = await fetch(`${baseUrl}/v1/steuerjahre/${JAHR}/uebernahme?von=${VORJAHR}`, { method: 'POST', headers: { cookie } })
    expect(uebernahme.status).toBe(200)
  }

  it('GWT — unbestätigt sperrt wie offen, der Nutzer gewinnt, Bestätigen je Anlage hebt die Sperre', async () => {
    const { cookie, userId } = await signUp('req-032-gwt@example.com')
    await vorjahrUndEigenerWert(cookie)

    // The user's own value stayed; the copied one is a proposal.
    const lstb = (await (await fetch(`${baseUrl}/v1/steuerjahre/${JAHR}/lstb`, { headers: { cookie } })).json()) as { bruttoarbeitslohn: unknown; lohnsteuer: unknown }
    expect(lstb.bruttoarbeitslohn).toEqual({ kind: 'erfasst', wert: 52000 })
    expect(lstb.lohnsteuer).toEqual({ kind: 'erfasst', wert: 8000 })

    expect(await fehlend(cookie)).toEqual(expect.arrayContaining(['unbestaetigt.anlageN', 'unbestaetigt.anlageKap']))
    const checkout = await fetch(`${baseUrl}/v1/steuerjahre/${JAHR}/ausdruck/checkout`, { method: 'POST', headers: { cookie } })
    expect(checkout.status).toBe(422)
    expect(((await checkout.json()) as { fehlend: string[] }).fehlend).toContain('unbestaetigt.anlageN')

    const vorher = await uebersicht(cookie)
    expect(vorher.anlagen.map((a) => a.anlage)).toEqual(['anlageN', 'anlageKap'])
    const anlageN = vorher.anlagen[0]!
    expect(anlageN.unbestaetigt).toBe(1)
    expect(anlageN.werte).toEqual([
      expect.objectContaining({ key: 'lstb.bruttoarbeitslohn', wert: '52000', herkunft: { art: 'nutzer' }, bestaetigt: true, vorschlag: expect.objectContaining({ wert: '50000' }) }),
      expect.objectContaining({ key: 'lstb.lohnsteuer', wert: '8000', herkunft: { art: 'uebernahme', vorjahr: VORJAHR }, bestaetigt: false, vorschlag: null }),
    ])

    // Ciphertext at rest (ADR-0008): the proposal is never stored as plaintext.
    const rows = await prisma.$queryRaw<Array<{ vorschlagWert: string | null }>>`SELECT "vorschlagWert" FROM "Kennzeichnung" WHERE "userId" = ${userId} AND "postenKey" = 'lstb.bruttoarbeitslohn'`
    expect(rows[0]?.vorschlagWert).toBeTruthy()
    expect(rows[0]?.vorschlagWert).not.toContain('50000')

    // Accept the proposal → written into the mask.
    expect((await put(cookie, `${JAHR}/bestaetigung/vorschlaege/lstb.bruttoarbeitslohn`, { entscheidung: 'annehmen' })).status).toBe(200)
    const lstbDanach = (await (await fetch(`${baseUrl}/v1/steuerjahre/${JAHR}/lstb`, { headers: { cookie } })).json()) as { bruttoarbeitslohn: unknown }
    expect(lstbDanach.bruttoarbeitslohn).toEqual({ kind: 'erfasst', wert: 50000 })

    // Confirm Anlage N → its block goes, Anlage KAP's stays.
    expect((await put(cookie, `${JAHR}/bestaetigung/anlagen/anlageN`)).status).toBe(200)
    const nachN = await fehlend(cookie)
    expect(nachN).not.toContain('unbestaetigt.anlageN')
    expect(nachN).toContain('unbestaetigt.anlageKap')

    // Changing a value yourself is confirming it.
    expect((await put(cookie, `${JAHR}/kapital/kapitalertraege`, { kind: 'erfasst', wert: 310 })).status).toBe(200)
    expect((await fehlend(cookie)).filter((k) => k.startsWith('unbestaetigt.'))).toEqual([])
    expect(await uebersicht(cookie)).toEqual({ anlagen: [] })
  })

  it('Herkunft und Bestätigungsstand sind Teil des Art.-15/20-Exports (entschlüsselt)', async () => {
    const { cookie, userId } = await signUp('req-032-export@example.com')
    await vorjahrUndEigenerWert(cookie)

    const { TAX_DATA_EXPORT_REPOSITORY } = await import('../../src/account/tax-data-export.repository.js')
    const repository = app.get<{ findAllForUser(userId: string): Promise<{ bereich: string; felder: Record<string, unknown> }[]> }>(TAX_DATA_EXPORT_REPOSITORY)
    const eintraege = (await repository.findAllForUser(userId)).filter((e) => e.bereich === 'Herkunft und Bestätigung')
    expect(eintraege.find((e) => e.felder.postenKey === 'lstb.bruttoarbeitslohn')?.felder).toMatchObject({
      herkunftArt: 'nutzer',
      bestaetigt: true,
      vorschlagHerkunftArt: 'uebernahme',
      vorschlagWert: '50000',
    })
    expect(eintraege.find((e) => e.felder.postenKey === 'lstb.lohnsteuer')?.felder).toMatchObject({ herkunftArt: 'uebernahme', vorjahr: VORJAHR, bestaetigt: false })
  })

  it('a guest gets 401 on every Bestätigung endpoint', async () => {
    expect((await fetch(`${baseUrl}/v1/steuerjahre/${JAHR}/bestaetigung`)).status).toBe(401)
    expect((await fetch(`${baseUrl}/v1/steuerjahre/${JAHR}/bestaetigung/anlagen/anlageN`, { method: 'PUT' })).status).toBe(401)
    const vorschlag = await fetch(`${baseUrl}/v1/steuerjahre/${JAHR}/bestaetigung/vorschlaege/lstb.lohnsteuer`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entscheidung: 'annehmen' }),
    })
    expect(vorschlag.status).toBe(401)
  })

  it('isolation — another account can neither see, confirm nor decide on someone else\'s values', async () => {
    const a = await signUp('req-032-a@example.com')
    const b = await signUp('req-032-b@example.com')
    await vorjahrUndEigenerWert(a.cookie)

    expect(await uebersicht(b.cookie)).toEqual({ anlagen: [] })
    expect((await put(b.cookie, `${JAHR}/bestaetigung/anlagen/anlageN`)).status).toBe(200)
    expect((await put(b.cookie, `${JAHR}/bestaetigung/vorschlaege/lstb.bruttoarbeitslohn`, { entscheidung: 'annehmen' })).status).toBe(404)

    expect(await fehlend(a.cookie)).toContain('unbestaetigt.anlageN')
    const lstbA = (await (await fetch(`${baseUrl}/v1/steuerjahre/${JAHR}/lstb`, { headers: { cookie: a.cookie } })).json()) as { bruttoarbeitslohn: unknown }
    expect(lstbA.bruttoarbeitslohn).toEqual({ kind: 'erfasst', wert: 52000 })
  })

  it('an unknown Anlage, an unknown field and a malformed decision are 400s', async () => {
    const { cookie } = await signUp('req-032-400@example.com')
    expect((await put(cookie, `${JAHR}/bestaetigung/anlagen/anlageX`)).status).toBe(400)
    expect((await put(cookie, `${JAHR}/bestaetigung/vorschlaege/gewerbe.gewinn`, { entscheidung: 'annehmen' })).status).toBe(400)
    expect((await put(cookie, `${JAHR}/bestaetigung/vorschlaege/lstb.lohnsteuer`, { entscheidung: 'vielleicht' })).status).toBe(400)
  })
})
