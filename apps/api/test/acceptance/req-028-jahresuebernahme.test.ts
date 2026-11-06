// REQ-028 — die Jahresübernahme (ticket 10.8, Produkt-ADR-021). Real Postgres, real HTTP against
// the actual `buildApp()` boot (never `.inject()`) — the acceptance tier the register's `Done`
// binds to (Musti's #249 R2 ruling).
//
// Covers the M1 core: ein neues Steuerjahr kopiert die LStB-Zeile des Vorjahrs (die gespeicherten
// Feld-Strings unverändert — die ehrlichen Zustände reisen mit), die Kennzeichnung markiert jedes
// kopierte Feld UNBESTÄTIGT (ADR-021, je Feld seit ADR-0052 §6); die Cockpit-Spanne trägt die übernommene Bruttosumme als Unsicherheit
// und versagt den Punktwert, bis bestätigt wird (ruhig, kein Konflikt); ein zweiter Kopierversuch
// ist ein 409, Gäste bekommen 401; bestätigt wird je Anlage (REQ-032); die kopierten
// Zahlen sind ciphertext at rest (ADR-0008).
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { resetRateLimiters } from '../support/reset-rate-limiters.js'

process.env.GUEST_SESSION_SECRET = 'req-028-secret'
process.env.BETTER_AUTH_SECRET = 'req-028-better-auth-secret-0123456789'
process.env.BETTER_AUTH_URL = 'http://127.0.0.1:39998'

const ALLOWED_ORIGIN = 'https://allowed.example.com'
process.env.CORS_ALLOWED_ORIGINS = ALLOWED_ORIGIN
const TRUSTED_ORIGIN_HEADERS = { origin: ALLOWED_ORIGIN }

const LAST_YEAR = 2025
const TARGET_YEAR = 2026

describe('REQ-028 — die Jahresübernahme (ADR-021), against the real server', () => {
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
    await prisma.$executeRawUnsafe(`DELETE FROM "Kennzeichnung"`)
    await prisma.$executeRawUnsafe(`DELETE FROM "Lstb"`)
    await prisma.$executeRawUnsafe(`DELETE FROM "Rente"`)
    await prisma.$executeRawUnsafe(`DELETE FROM "Kapital"`)
    await prisma.$executeRawUnsafe(`DELETE FROM "Vermietungsobjekt"`)
    await prisma.$executeRawUnsafe(`DELETE FROM "InterviewAnswer"`)
    await prisma.taxYear.deleteMany()
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
      headers: { 'content-type': 'application/json', ...TRUSTED_ORIGIN_HEADERS },
      body: JSON.stringify({ email, password: 'a-fine-strong-password-1', name: 'Test User' }),
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { user: { id: string } }
    const cookie = response.headers.get('set-cookie')!.split(';')[0]!
    return { cookie, userId: body.user.id }
  }

  function postAnswer(cookie: string, year: number, questionId: string, value: string) {
    return fetch(`${baseUrl}/v1/steuerjahre/${year}/interview/antworten`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ questionId, value }),
    })
  }

  function putLstb(cookie: string, year: number, field: string, value: number) {
    return fetch(`${baseUrl}/v1/steuerjahre/${year}/lstb/${field}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ kind: 'erfasst', value }),
    })
  }

  it(
    'GWT — die Übernahme kopiert die LStB-Zeile UNBESTÄTIGT; die Cockpit-Spanne trägt die Summe, Bestätigen gibt den Punktwert',
    async () => {
      const { cookie, userId } = await signUp('gwt-uebernahme@example.com')
      // Vorjahr füllen.
      await putLstb(cookie, LAST_YEAR, 'bruttoarbeitslohn', 50000)
      await putLstb(cookie, LAST_YEAR, 'lohnsteuer', 8000)
      await putLstb(cookie, LAST_YEAR, 'sozialversicherung', 9000)
      // Zieljahr anlegen (Minimal-Gate).
      for (const [q, v] of [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', 'Nein']] as const) {
        expect((await postAnswer(cookie, TARGET_YEAR, q, v)).status).toBe(200)
      }

      const response = await fetch(`${baseUrl}/v1/steuerjahre/${TARGET_YEAR}/uebernahme?von=${LAST_YEAR}`, { method: 'POST', headers: { cookie } })
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        markings: ['lstb.bruttoarbeitslohn', 'lstb.lohnsteuer', 'lstb.sozialversicherung'].map((postenKey) => ({ postenKey, vorjahr: LAST_YEAR, bestaetigt: false })),
      })

      // Die kopierte Zeile trägt die Feld-Strings unverändert (die ehrlichen Zustände reisen mit).
      const lstbTarget = await fetch(`${baseUrl}/v1/steuerjahre/${TARGET_YEAR}/lstb`, { headers: { cookie } })
      const lstbBody = (await lstbTarget.json()) as { bruttoarbeitslohn: { kind: string; value?: number } }
      expect(lstbBody.bruttoarbeitslohn).toEqual({ kind: 'erfasst', value: 50000 })

      // Cockpit: Punktwert versagt, Spanne trägt die übernommene Summe (ruhig benannt).
      const cockpit = await fetch(`${baseUrl}/v1/steuerjahre/${TARGET_YEAR}/cockpit`, { headers: { cookie } })
      const cockpitBody = (await cockpit.json()) as { status: { kind: string; from: number; to: number; unconfirmedItems?: number; unconfirmedSum?: number } }
      expect(cockpitBody.status).toMatchObject({ kind: 'spanne', unconfirmedItems: 1, unconfirmedSum: 50000 })
      expect(cockpitBody.status.from).toBe(0)
      expect(cockpitBody.status.to).toBe(100000)

      // Anlage N bestätigen (REQ-032) → Punktwert.
      const bestaetigt = await fetch(`${baseUrl}/v1/steuerjahre/${TARGET_YEAR}/bestaetigung/anlagen/anlageN`, { method: 'PUT', headers: { cookie } })
      expect(bestaetigt.status).toBe(200)
      const state = await fetch(`${baseUrl}/v1/steuerjahre/${TARGET_YEAR}/uebernahme`, { headers: { cookie } })
      expect(((await state.json()) as { markings: Array<{ bestaetigt: boolean }> }).markings.every((k) => k.bestaetigt)).toBe(true)

      const cockpit2 = await fetch(`${baseUrl}/v1/steuerjahre/${TARGET_YEAR}/cockpit`, { headers: { cookie } })
      const cockpit2Body = (await cockpit2.json()) as { status: { kind: string; value?: number } }
      expect(cockpit2Body.status).toEqual({ kind: 'bestimmt', value: 50000 })

      // Ciphertext at rest (ADR-0008): die kopierte Zahl ist KEIN Klartext in der DB.
      const rows = await prisma.$queryRaw<Array<{ bruttoarbeitslohn: string | null }>>`SELECT "bruttoarbeitslohn" FROM "Lstb" WHERE "userId" = ${userId} AND "steuerjahr" = ${TARGET_YEAR}`
      expect(rows[0]?.bruttoarbeitslohn).not.toBe('50000')
    },
  )

  it('ein zweiter Kopierversuch ist ein 409', async () => {
    const { cookie } = await signUp('idempotenz@example.com')
    await putLstb(cookie, LAST_YEAR, 'bruttoarbeitslohn', 50000)
    await fetch(`${baseUrl}/v1/steuerjahre/${TARGET_YEAR}/uebernahme?von=${LAST_YEAR}`, { method: 'POST', headers: { cookie } })

    const second = await fetch(`${baseUrl}/v1/steuerjahre/${TARGET_YEAR}/uebernahme?von=${LAST_YEAR}`, { method: 'POST', headers: { cookie } })
    expect(second.status).toBe(409)
  })

  it('ein zweiter Kopierversuch ist auch dann ein 409, wenn der Nutzer alle übernommenen Felder selbst editiert hat', async () => {
    const { cookie } = await signUp('alle-felder-editiert@example.com')
    await putLstb(cookie, LAST_YEAR, 'bruttoarbeitslohn', 50000)
    await fetch(`${baseUrl}/v1/steuerjahre/${TARGET_YEAR}/uebernahme?von=${LAST_YEAR}`, { method: 'POST', headers: { cookie } })

    // Nutzer ändert den Wert im Zieljahr selbst -> Kennzeichnung entfällt
    await putLstb(cookie, TARGET_YEAR, 'bruttoarbeitslohn', 60000)

    // Zweiter Versuch ins selbe Jahr muss 409 bleiben (Randfall-Schutz)
    const second = await fetch(`${baseUrl}/v1/steuerjahre/${TARGET_YEAR}/uebernahme?von=${LAST_YEAR}`, { method: 'POST', headers: { cookie } })
    expect(second.status).toBe(409)
  })

  it('ein Vorjahr ohne EINEN einzigen übernehmbaren Fakt ist ein 404 — nie eine erfundene Kopie', async () => {
    const { cookie } = await signUp('leeres-vorjahr@example.com')

    const response = await fetch(`${baseUrl}/v1/steuerjahre/${TARGET_YEAR}/uebernahme?von=${LAST_YEAR}`, { method: 'POST', headers: { cookie } })
    expect(response.status).toBe(404)
  })

  it('ADR-022: ein von mehr als 4 Jahre zurück ist ein 400 — nie eine stille Alt-Kopie', async () => {
    const { cookie } = await signUp('zu-alt@example.com')

    const response = await fetch(`${baseUrl}/v1/steuerjahre/${TARGET_YEAR}/uebernahme?von=2021`, { method: 'POST', headers: { cookie } })
    expect(response.status).toBe(400)
  })

  it('M2: eine Übernahme mit NUR Rente (kein LStB) kopiert die Rente — der Fakt zählt, nicht die Anlage', async () => {
    const { cookie } = await signUp('nur-rente@example.com')
    await fetch(`${baseUrl}/v1/steuerjahre/${LAST_YEAR}/rente/art`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ art: 'GesetzlicheRente' }),
    })
    await fetch(`${baseUrl}/v1/steuerjahre/${LAST_YEAR}/rente/jahresbetrag`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ kind: 'erfasst', value: 12000 }),
    })

    const response = await fetch(`${baseUrl}/v1/steuerjahre/${TARGET_YEAR}/uebernahme?von=${LAST_YEAR}`, { method: 'POST', headers: { cookie } })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { markings: Array<{ postenKey: string; vorjahr: number; bestaetigt: boolean }> }
    expect(body.markings).toEqual([
      { postenKey: 'rente.jahresbetrag', vorjahr: LAST_YEAR, bestaetigt: false },
      { postenKey: 'rente.rentenart', vorjahr: LAST_YEAR, bestaetigt: false },
    ])

    const pensionTarget = await fetch(`${baseUrl}/v1/steuerjahre/${TARGET_YEAR}/rente`, { headers: { cookie } })
    const pensionBody = (await pensionTarget.json()) as { art: string | null; jahresbetrag: { kind: string; value?: number } }
    expect(pensionBody.art).toBe('GesetzlicheRente')
    expect(pensionBody.jahresbetrag).toEqual({ kind: 'erfasst', value: 12000 })
  })

  it('M2 GWT: die Übernahme kopiert ALLE Fakten (LStB+Rente+Kapital+2 Objekte), die Spanne trägt die Gesamtsumme, Bestätigen je Anlage gibt den Punktwert', async () => {
    const { cookie, userId } = await signUp('m2-alles@example.com')
    await putLstb(cookie, LAST_YEAR, 'bruttoarbeitslohn', 50000)
    await putLstb(cookie, LAST_YEAR, 'lohnsteuer', 8000)
    await putLstb(cookie, LAST_YEAR, 'sozialversicherung', 9000)
    await fetch(`${baseUrl}/v1/steuerjahre/${LAST_YEAR}/rente/art`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ art: 'GesetzlicheRente' }),
    })
    await fetch(`${baseUrl}/v1/steuerjahre/${LAST_YEAR}/rente/jahresbetrag`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ kind: 'erfasst', value: 12000 }),
    })
    await fetch(`${baseUrl}/v1/steuerjahre/${LAST_YEAR}/kapital/kapitalertraege`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ kind: 'erfasst', value: 3000 }),
    })
    const property1 = await fetch(`${baseUrl}/v1/steuerjahre/${LAST_YEAR}/vermietung/objekte`, { method: 'POST', headers: { cookie } })
    const property1Body = (await property1.json()) as { properties: Array<{ id: string }> }
    const putRent = await fetch(`${baseUrl}/v1/steuerjahre/${LAST_YEAR}/vermietung/objekte/${property1Body.properties[0]!.id}/mieteinnahmen`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ kind: 'erfasst', value: 9600 }),
    })
    expect(putRent.status).toBe(200)
    for (const [q, v] of [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', 'Nein']] as const) {
      expect((await postAnswer(cookie, TARGET_YEAR, q, v)).status).toBe(200)
    }

    const response = await fetch(`${baseUrl}/v1/steuerjahre/${TARGET_YEAR}/uebernahme?von=${LAST_YEAR}`, { method: 'POST', headers: { cookie } })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { markings: Array<{ postenKey: string; vorjahr: number; bestaetigt: boolean }> }
    const keys = body.markings.map((k) => k.postenKey)
    expect(keys).toContain('lstb.bruttoarbeitslohn')
    expect(keys).toContain('rente.jahresbetrag')
    expect(keys).toContain('kapital.kapitalertraege')
    expect(keys.filter((k) => k.startsWith('vermietung:'))).toEqual([expect.stringMatching(/^vermietung:[^.]+\.mieteinnahmen$/)])
    expect(body.markings.every((k) => k.vorjahr === LAST_YEAR && k.bestaetigt === false)).toBe(true)

    // Die Spanne trägt die Gesamtsumme aller unbestätigten Fakten: 50000+12000+3000+9600 = 74600.
    const cockpit = await fetch(`${baseUrl}/v1/steuerjahre/${TARGET_YEAR}/cockpit`, { headers: { cookie } })
    const cockpitBody = (await cockpit.json()) as { status: { kind: string; from: number; to: number; unconfirmedItems?: number; unconfirmedSum?: number } }
    expect(cockpitBody.status).toMatchObject({ kind: 'spanne', unconfirmedItems: 4, unconfirmedSum: 74600 })
    expect(cockpitBody.status.from).toBe(0)
    expect(cockpitBody.status.to).toBe(50000 + 74600)

    // Bestätigen je Anlage (REQ-032) → Punktwert.
    for (const anlage of ['anlageN', 'anlageR', 'anlageKap', 'anlageV']) {
      const bestaetigt = await fetch(`${baseUrl}/v1/steuerjahre/${TARGET_YEAR}/bestaetigung/anlagen/${anlage}`, { method: 'PUT', headers: { cookie } })
      expect(bestaetigt.status).toBe(200)
    }
    const cockpit2 = await fetch(`${baseUrl}/v1/steuerjahre/${TARGET_YEAR}/cockpit`, { headers: { cookie } })
    const cockpit2Body = (await cockpit2.json()) as { status: { kind: string; value?: number } }
    expect(cockpit2Body.status).toEqual({ kind: 'bestimmt', value: 50000 })

    // Ciphertext at rest (ADR-0008): auch die kopierten Rente-/Kapital-Zahlen sind KEIN Klartext.
    const pensionRows = await prisma.$queryRaw<Array<{ jahresbetrag: string | null }>>`SELECT "jahresbetrag" FROM "Rente" WHERE "userId" = ${userId} AND "steuerjahr" = ${TARGET_YEAR}`
    expect(pensionRows[0]?.jahresbetrag).not.toBe('12000')
    const capitalRows = await prisma.$queryRaw<Array<{ kapitalertraege: string | null }>>`SELECT "kapitalertraege" FROM "Kapital" WHERE "userId" = ${userId} AND "steuerjahr" = ${TARGET_YEAR}`
    expect(capitalRows[0]?.kapitalertraege).not.toBe('3000')
  })

  it('die Endpoints verlangen ein echtes Konto — ein Gast bekommt 401', async () => {
    const response = await fetch(`${baseUrl}/v1/steuerjahre/${TARGET_YEAR}/uebernahme`, { method: 'POST', headers: TRUSTED_ORIGIN_HEADERS })
    expect(response.status).toBe(401)
  })
})
