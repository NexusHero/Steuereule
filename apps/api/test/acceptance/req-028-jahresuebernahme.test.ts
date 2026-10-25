// REQ-028 — die Jahresübernahme (ticket 10.8, Produkt-ADR-021). Real Postgres, real HTTP against
// the actual `buildApp()` boot (never `.inject()`) — the acceptance tier the register's `Done`
// binds to (Musti's #249 R2 ruling).
//
// Covers the M1 core: ein neues Steuerjahr kopiert die LStB-Zeile des Vorjahrs (die gespeicherten
// Feld-Strings unverändert — die ehrlichen Zustände reisen mit), die Kennzeichnung markiert sie
// UNBESTÄTIGT (ADR-021); die Cockpit-Spanne trägt die übernommene Bruttosumme als Unsicherheit
// und versagt den Punktwert, bis bestätigt wird (ruhig, kein Konflikt); ein zweiter Kopierversuch
// ist ein 409, eine Bestätigung ohne Kennzeichnung ein 404, Gäste bekommen 401; die kopierten
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

const VORJAHR = 2025
const ZIELJAHR = 2026

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
    await prisma.$executeRawUnsafe(`DELETE FROM "UebernahmeKennzeichnung"`)
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

  function postAnswer(cookie: string, jahr: number, questionId: string, value: string) {
    return fetch(`${baseUrl}/v1/steuerjahre/${jahr}/interview/antworten`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ questionId, value }),
    })
  }

  function putLstb(cookie: string, jahr: number, feld: string, wert: number) {
    return fetch(`${baseUrl}/v1/steuerjahre/${jahr}/lstb/${feld}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ kind: 'erfasst', wert }),
    })
  }

  it(
    'GWT — die Übernahme kopiert die LStB-Zeile UNBESTÄTIGT; die Cockpit-Spanne trägt die Summe, Bestätigen gibt den Punktwert',
    async () => {
      const { cookie, userId } = await signUp('gwt-uebernahme@example.com')
      // Vorjahr füllen.
      await putLstb(cookie, VORJAHR, 'bruttoarbeitslohn', 50000)
      await putLstb(cookie, VORJAHR, 'lohnsteuer', 8000)
      await putLstb(cookie, VORJAHR, 'sozialversicherung', 9000)
      // Zieljahr anlegen (Minimal-Gate).
      for (const [q, v] of [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', 'Nein']] as const) {
        expect((await postAnswer(cookie, ZIELJAHR, q, v)).status).toBe(200)
      }

      const response = await fetch(`${baseUrl}/v1/steuerjahre/${ZIELJAHR}/uebernahme?von=${VORJAHR}`, { method: 'POST', headers: { cookie } })
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ kennzeichnungen: [{ postenKey: 'lstb', vorjahr: VORJAHR, bestaetigt: false }] })

      // Die kopierte Zeile trägt die Feld-Strings unverändert (die ehrlichen Zustände reisen mit).
      const lstbZiel = await fetch(`${baseUrl}/v1/steuerjahre/${ZIELJAHR}/lstb`, { headers: { cookie } })
      const lstbBody = (await lstbZiel.json()) as { bruttoarbeitslohn: { kind: string; wert?: number } }
      expect(lstbBody.bruttoarbeitslohn).toEqual({ kind: 'erfasst', wert: 50000 })

      // Cockpit: Punktwert versagt, Spanne trägt die übernommene Summe (ruhig benannt).
      const cockpit = await fetch(`${baseUrl}/v1/steuerjahre/${ZIELJAHR}/cockpit`, { headers: { cookie } })
      const cockpitBody = (await cockpit.json()) as { stand: { kind: string; von: number; bis: number; unbestaetigte?: number; unbestaetigteSumme?: number } }
      expect(cockpitBody.stand).toMatchObject({ kind: 'spanne', unbestaetigte: 1, unbestaetigteSumme: 50000 })
      expect(cockpitBody.stand.von).toBe(0)
      expect(cockpitBody.stand.bis).toBe(100000)

      // Bestätigen (ADR-021: angetippt) → Punktwert.
      const bestaetigt = await fetch(`${baseUrl}/v1/steuerjahre/${ZIELJAHR}/uebernahme/lstb/bestaetigen`, { method: 'PUT', headers: { cookie } })
      expect(bestaetigt.status).toBe(200)
      expect(await bestaetigt.json()).toEqual({ kennzeichnungen: [{ postenKey: 'lstb', vorjahr: VORJAHR, bestaetigt: true }] })

      const cockpit2 = await fetch(`${baseUrl}/v1/steuerjahre/${ZIELJAHR}/cockpit`, { headers: { cookie } })
      const cockpit2Body = (await cockpit2.json()) as { stand: { kind: string; wert?: number } }
      expect(cockpit2Body.stand).toEqual({ kind: 'bestimmt', wert: 50000 })

      // Ciphertext at rest (ADR-0008): die kopierte Zahl ist KEIN Klartext in der DB.
      const rows = await prisma.$queryRaw<Array<{ bruttoarbeitslohn: string | null }>>`SELECT "bruttoarbeitslohn" FROM "Lstb" WHERE "userId" = ${userId} AND "steuerjahr" = ${ZIELJAHR}`
      expect(rows[0]?.bruttoarbeitslohn).not.toBe('50000')
    },
  )

  it('ein zweiter Kopierversuch ist ein 409, eine Bestätigung ohne Kennzeichnung ein 404', async () => {
    const { cookie } = await signUp('idempotenz@example.com')
    await putLstb(cookie, VORJAHR, 'bruttoarbeitslohn', 50000)
    await fetch(`${baseUrl}/v1/steuerjahre/${ZIELJAHR}/uebernahme?von=${VORJAHR}`, { method: 'POST', headers: { cookie } })

    const zweiter = await fetch(`${baseUrl}/v1/steuerjahre/${ZIELJAHR}/uebernahme?von=${VORJAHR}`, { method: 'POST', headers: { cookie } })
    expect(zweiter.status).toBe(409)

    const fremd = await fetch(`${baseUrl}/v1/steuerjahre/${ZIELJAHR}/uebernahme/gibt-es-nicht/bestaetigen`, { method: 'PUT', headers: { cookie } })
    expect(fremd.status).toBe(404)
  })

  it('ein Vorjahr ohne EINEN einzigen übernehmbaren Fakt ist ein 404 — nie eine erfundene Kopie', async () => {
    const { cookie } = await signUp('leeres-vorjahr@example.com')

    const response = await fetch(`${baseUrl}/v1/steuerjahre/${ZIELJAHR}/uebernahme?von=${VORJAHR}`, { method: 'POST', headers: { cookie } })
    expect(response.status).toBe(404)
  })

  it('M2: eine Übernahme mit NUR Rente (kein LStB) kopiert die Rente — der Fakt zählt, nicht die Anlage', async () => {
    const { cookie } = await signUp('nur-rente@example.com')
    await fetch(`${baseUrl}/v1/steuerjahre/${VORJAHR}/rente/art`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ art: 'GesetzlicheRente' }),
    })
    await fetch(`${baseUrl}/v1/steuerjahre/${VORJAHR}/rente/jahresbetrag`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ kind: 'erfasst', wert: 12000 }),
    })

    const response = await fetch(`${baseUrl}/v1/steuerjahre/${ZIELJAHR}/uebernahme?von=${VORJAHR}`, { method: 'POST', headers: { cookie } })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { kennzeichnungen: Array<{ postenKey: string; vorjahr: number; bestaetigt: boolean }> }
    expect(body.kennzeichnungen).toEqual([{ postenKey: 'rente', vorjahr: VORJAHR, bestaetigt: false }])

    const renteZiel = await fetch(`${baseUrl}/v1/steuerjahre/${ZIELJAHR}/rente`, { headers: { cookie } })
    const renteBody = (await renteZiel.json()) as { art: string | null; jahresbetrag: { kind: string; wert?: number } }
    expect(renteBody.art).toBe('GesetzlicheRente')
    expect(renteBody.jahresbetrag).toEqual({ kind: 'erfasst', wert: 12000 })
  })

  it('M2 GWT: die Übernahme kopiert ALLE Fakten (LStB+Rente+Kapital+2 Objekte), die Spanne trägt die Gesamtsumme, Bestätigen je Fakt gibt den Punktwert', async () => {
    const { cookie, userId } = await signUp('m2-alles@example.com')
    await putLstb(cookie, VORJAHR, 'bruttoarbeitslohn', 50000)
    await putLstb(cookie, VORJAHR, 'lohnsteuer', 8000)
    await putLstb(cookie, VORJAHR, 'sozialversicherung', 9000)
    await fetch(`${baseUrl}/v1/steuerjahre/${VORJAHR}/rente/art`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ art: 'GesetzlicheRente' }),
    })
    await fetch(`${baseUrl}/v1/steuerjahre/${VORJAHR}/rente/jahresbetrag`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ kind: 'erfasst', wert: 12000 }),
    })
    await fetch(`${baseUrl}/v1/steuerjahre/${VORJAHR}/kapital/kapitalertraege`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ kind: 'erfasst', wert: 3000 }),
    })
    const objekt1 = await fetch(`${baseUrl}/v1/steuerjahre/${VORJAHR}/vermietung/objekte`, { method: 'POST', headers: { cookie } })
    const objekt1Body = (await objekt1.json()) as { objekte: Array<{ id: string }> }
    const putMiete = await fetch(`${baseUrl}/v1/steuerjahre/${VORJAHR}/vermietung/objekte/${objekt1Body.objekte[0]!.id}/mieteinnahmen`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ kind: 'erfasst', wert: 9600 }),
    })
    expect(putMiete.status).toBe(200)
    for (const [q, v] of [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', 'Nein']] as const) {
      expect((await postAnswer(cookie, ZIELJAHR, q, v)).status).toBe(200)
    }

    const response = await fetch(`${baseUrl}/v1/steuerjahre/${ZIELJAHR}/uebernahme?von=${VORJAHR}`, { method: 'POST', headers: { cookie } })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { kennzeichnungen: Array<{ postenKey: string; vorjahr: number; bestaetigt: boolean }> }
    const keys = body.kennzeichnungen.map((k) => k.postenKey)
    expect(keys).toContain('lstb')
    expect(keys).toContain('rente')
    expect(keys).toContain('kapital')
    expect(keys.filter((k) => k.startsWith('vermietung-'))).toHaveLength(1)
    expect(body.kennzeichnungen.every((k) => k.vorjahr === VORJAHR && k.bestaetigt === false)).toBe(true)

    // Die Spanne trägt die Gesamtsumme aller unbestätigten Fakten: 50000+12000+3000+9600 = 74600.
    const cockpit = await fetch(`${baseUrl}/v1/steuerjahre/${ZIELJAHR}/cockpit`, { headers: { cookie } })
    const cockpitBody = (await cockpit.json()) as { stand: { kind: string; von: number; bis: number; unbestaetigte?: number; unbestaetigteSumme?: number } }
    expect(cockpitBody.stand).toMatchObject({ kind: 'spanne', unbestaetigte: 4, unbestaetigteSumme: 74600 })
    expect(cockpitBody.stand.von).toBe(0)
    expect(cockpitBody.stand.bis).toBe(50000 + 74600)

    // Bestätigen je Fakt → Punktwert.
    for (const key of ['lstb', 'rente', 'kapital', keys.find((k) => k.startsWith('vermietung-'))!]) {
      const bestaetigt = await fetch(`${baseUrl}/v1/steuerjahre/${ZIELJAHR}/uebernahme/${key}/bestaetigen`, { method: 'PUT', headers: { cookie } })
      expect(bestaetigt.status).toBe(200)
    }
    const cockpit2 = await fetch(`${baseUrl}/v1/steuerjahre/${ZIELJAHR}/cockpit`, { headers: { cookie } })
    const cockpit2Body = (await cockpit2.json()) as { stand: { kind: string; wert?: number } }
    expect(cockpit2Body.stand).toEqual({ kind: 'bestimmt', wert: 50000 })

    // Ciphertext at rest (ADR-0008): auch die kopierten Rente-/Kapital-Zahlen sind KEIN Klartext.
    const renteRows = await prisma.$queryRaw<Array<{ jahresbetrag: string | null }>>`SELECT "jahresbetrag" FROM "Rente" WHERE "userId" = ${userId} AND "steuerjahr" = ${ZIELJAHR}`
    expect(renteRows[0]?.jahresbetrag).not.toBe('12000')
    const kapitalRows = await prisma.$queryRaw<Array<{ kapitalertraege: string | null }>>`SELECT "kapitalertraege" FROM "Kapital" WHERE "userId" = ${userId} AND "steuerjahr" = ${ZIELJAHR}`
    expect(kapitalRows[0]?.kapitalertraege).not.toBe('3000')
  })

  it('die Endpoints verlangen ein echtes Konto — ein Gast bekommt 401', async () => {
    const response = await fetch(`${baseUrl}/v1/steuerjahre/${ZIELJAHR}/uebernahme`, { method: 'POST', headers: TRUSTED_ORIGIN_HEADERS })
    expect(response.status).toBe(401)
  })
})
