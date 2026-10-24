// REQ-021 — the CH-Posten folding (Vorsorge + Quellensteuer-Anrechnung), Grenzgänger-CH
// vertical (ticket 16). Real Postgres, real HTTP against the actual `buildApp()` boot (never
// `.inject()`) — the acceptance tier the register's `Done` binds to (Musti's #249 R2 ruling).
//
// Covers the ticket's Vorsorge-Faltung bullet: the CH-Lohnausweis CHF values convert CHF→EUR
// through the deterministic core with provenance ("Lohnausweis Ziffer n × Kurs"), folding
// Bruttolohn→Einnahmen, PK→Vorsorgeaufwand, Quellensteuer→Anrechnung; the Wechselkurs is amtlich
// by default and tatsächlich only with a Beleg (ADR-012); an empty required field stays open,
// never a fabricated zero; and the figures are ciphertext at rest (ADR-0008).
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { resetRateLimiters } from '../support/reset-rate-limiters.js'

process.env.GUEST_SESSION_SECRET = 'req-021-secret'
process.env.BETTER_AUTH_SECRET = 'req-021-better-auth-secret-0123456789'
process.env.BETTER_AUTH_URL = 'http://127.0.0.1:39992'

const ALLOWED_ORIGIN = 'https://allowed.example.com'
process.env.CORS_ALLOWED_ORIGINS = ALLOWED_ORIGIN
const TRUSTED_ORIGIN_HEADERS = { origin: ALLOWED_ORIGIN }

const STEUERJAHR = 2026
const KURS = 0.9412

type ChLohnausweisRow = { userId: string; bruttolohnTotal: string | null }

describe('REQ-021 — the CH-Posten folding (Vorsorge + Quellensteuer-Anrechnung), against the real server', () => {
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
    await prisma.$executeRawUnsafe(`DELETE FROM "ChLohnausweis"`)
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

  /** Answer the two CH-interview questions in order so a Grenzgänger-Status is derived. */
  async function antworteChInterview(cookie: string) {
    const wohnsitz = await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview/antworten`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ questionId: 'ch-wohnsitz', value: 'Deutschland' }),
    })
    expect(wohnsitz.status).toBe(200)
    const tage = await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview/antworten`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ questionId: 'ch-nichtrueckkehrtage', value: '10' }),
    })
    expect(tage.status).toBe(200)
  }

  function get(cookie: string) {
    return fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/ch-lohnausweis`, { headers: { cookie } })
  }

  function putFeld(cookie: string, feld: string, body: unknown) {
    return fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/ch-lohnausweis/${feld}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(body),
    })
  }

  function putWechselkurs(cookie: string, body: unknown) {
    return fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/ch-lohnausweis/wechselkurs`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(body),
    })
  }

  it(
    'GWT — a CH-Lohnausweis in CHF folds through the core: Bruttolohn→Einnahmen, PK→Vorsorgeaufwand, ' +
      'Quellensteuer→Anrechnung, each with "Lohnausweis Ziffer n × Kurs" provenance',
    async () => {
      const { cookie } = await signUp('gwt-fold@example.com')
      await antworteChInterview(cookie)

      await putWechselkurs(cookie, { monat: '2026-01', kurs: KURS, modus: 'amtlich' })
      await putFeld(cookie, 'bruttolohn-total', { kind: 'erfasst', wert: 84000 })
      await putFeld(cookie, 'berufliche-vorsorge', { kind: 'erfasst', wert: 5000 })
      const response = await putFeld(cookie, 'quellensteuer', { kind: 'erfasst', wert: 3780 })

      const body = (await response.json()) as {
        status: string
        wechselkurs: { monat: string; kurs: number; modus: string }
        posten: Array<{ id: string; art: string; ziffer: string; betragChf: number; betragEur: number; rolle: string }>
        stand: { kind: string; einnahmen: number; vorsorgeaufwand: number; anrechnung: number }
      }

      expect(body.status).toBe('echter-grenzgaenger')
      expect(body.wechselkurs).toMatchObject({ monat: '2026-01', kurs: KURS, modus: 'amtlich' })

      expect(body.posten).toEqual([
        {
          id: 'ch-lohnausweis-bruttolohn-total',
          art: 'Bruttolohn',
          ziffer: '8',
          betragChf: 84000,
          betragEur: 79060.8,
          rolle: 'einnahme',
          wechselkurs: { monat: '2026-01', kurs: KURS, modus: 'amtlich' },
        },
        {
          id: 'ch-lohnausweis-berufliche-vorsorge',
          art: 'Pensionskasse',
          ziffer: '10',
          betragChf: 5000,
          betragEur: 4706,
          rolle: 'vorsorgeaufwand',
          wechselkurs: { monat: '2026-01', kurs: KURS, modus: 'amtlich' },
        },
        {
          id: 'ch-lohnausweis-quellensteuer',
          art: 'Quellensteuer',
          ziffer: '12',
          betragChf: 3780,
          betragEur: 3557.74,
          rolle: 'anrechnung',
          wechselkurs: { monat: '2026-01', kurs: KURS, modus: 'amtlich' },
        },
      ])

      expect(body.stand).toEqual({ kind: 'bestimmt', einnahmen: 79061, vorsorgeaufwand: 4706, anrechnung: 3558 })
    },
  )

  it('an empty required field stays open, never a fabricated zero (ADR-032 honesty)', async () => {
    const { cookie } = await signUp('open-field@example.com')
    await antworteChInterview(cookie)
    await putWechselkurs(cookie, { monat: '2026-01', kurs: KURS, modus: 'amtlich' })

    const body = (await (await get(cookie)).json()) as {
      posten: unknown[]
      stand: { kind: string; einnahmen: number; vorsorgeaufwand: number; anrechnung: number; offenePosten?: number }
    }
    expect(body.posten).toEqual([])
    expect(body.stand.kind).toBe('offen')
    expect(body.stand).toMatchObject({
      einnahmen: 0,
      vorsorgeaufwand: 0,
      anrechnung: 0,
      offenePosten: 3, // bruttolohn-total + berufliche-vorsorge + quellensteuer
    })
  })

  it('a tatsächlicher Kurs without a Beleg is rejected (ADR-012: "ohne Beleg kein tatsächlicher Kurs")', async () => {
    const { cookie } = await signUp('tatsaechlich@example.com')

    const response = await putWechselkurs(cookie, { monat: '2026-01', kurs: 0.95, modus: 'tatsaechlich' })
    expect(response.status).toBe(400)
  })

  describe('P3 — no guest path: @RequiresAccount() rejects a guest with 401', () => {
    it('GET without an account session is 401', async () => {
      const response = await get('')
      expect(response.status).toBe(401)
    })

    it('PUT without an account session is 401 and creates no row', async () => {
      const response = await putFeld('', 'bruttolohn-total', { kind: 'erfasst', wert: 1 })
      expect(response.status).toBe(401)
      const rows = await prisma.$queryRaw<ChLohnausweisRow[]>`SELECT "userId" FROM "ChLohnausweis"`
      expect(rows).toEqual([])
    })
  })

  describe('P4 — cross-user isolation', () => {
    it('user B can neither read nor write user A’s CH-Lohnausweis row', async () => {
      const userA = await signUp('p4-a@example.com')
      const userB = await signUp('p4-b@example.com')
      await antworteChInterview(userA.cookie)
      await putWechselkurs(userA.cookie, { monat: '2026-01', kurs: KURS, modus: 'amtlich' })
      await putFeld(userA.cookie, 'bruttolohn-total', { kind: 'erfasst', wert: 84000 })

      const asB = await (await get(userB.cookie)).json() as { felder: Array<{ id: string; kind: string }> }
      const bruttoB = asB.felder.find((f) => f.id === 'bruttolohn-total')
      expect(bruttoB).toMatchObject({ kind: 'offen' })

      const asA = await (await get(userA.cookie)).json() as { felder: Array<{ id: string; kind: string; wert?: number }> }
      const bruttoA = asA.felder.find((f) => f.id === 'bruttolohn-total')
      expect(bruttoA).toMatchObject({ kind: 'erfasst', wert: 84000 })
    })
  })

  describe('P5 — figures are ciphertext at rest, checked by raw SQL, never through the Prisma client', () => {
    it('a real PUT’s Bruttolohn is not stored as plaintext', async () => {
      const { cookie, userId } = await signUp('p5-cipher@example.com')
      await antworteChInterview(cookie)
      await putWechselkurs(cookie, { monat: '2026-01', kurs: KURS, modus: 'amtlich' })
      await putFeld(cookie, 'bruttolohn-total', { kind: 'erfasst', wert: 84000 })

      const rawRows = await prisma.$queryRaw<{ bruttolohnTotal: string | null }[]>`
        SELECT "bruttolohnTotal" FROM "ChLohnausweis" WHERE "userId" = ${userId}
      `
      expect(rawRows).toHaveLength(1)
      const rawValue = rawRows[0]!.bruttolohnTotal
      expect(rawValue).not.toBe('84000')
      expect(rawValue).not.toBeNull()
      expect(rawValue).toMatch(/^v\d+\.aesgcm256\./)
    })
  })

  describe('audit trail (ADR-0008) — the same house pattern as Profile/Lstb', () => {
    it('each admitted write appends exactly one WRITE audit entry, atomic with the row', async () => {
      const { cookie, userId } = await signUp('audit-write@example.com')

      await putWechselkurs(cookie, { monat: '2026-01', kurs: KURS, modus: 'amtlich' })
      await putFeld(cookie, 'bruttolohn-total', { kind: 'erfasst', wert: 84000 })

      const rows = await prisma.$queryRaw<{ action: string; resource: string }[]>`
        SELECT "action", "resource" FROM "TaxDataAccessLog" WHERE "userId" = ${userId}
      `
      expect(rows.filter((r) => r.action === 'WRITE' && r.resource === 'ch-lohnausweis')).toHaveLength(2)
    })
  })
})
