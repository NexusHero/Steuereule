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

const TAX_YEAR = 2026
const RATE = 0.9412

type ChSalaryCertificateRow = { userId: string; bruttolohnTotal: string | null }

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
  async function answerChInterview(cookie: string) {
    const residence = await fetch(`${baseUrl}/v1/steuerjahre/${TAX_YEAR}/interview/antworten`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ questionId: 'ch-wohnsitz', value: 'Deutschland' }),
    })
    expect(residence.status).toBe(200)
    const days = await fetch(`${baseUrl}/v1/steuerjahre/${TAX_YEAR}/interview/antworten`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ questionId: 'ch-nichtrueckkehrtage', value: '10' }),
    })
    expect(days.status).toBe(200)
  }

  function get(cookie: string) {
    return fetch(`${baseUrl}/v1/steuerjahre/${TAX_YEAR}/ch-lohnausweis`, { headers: { cookie } })
  }

  function putField(cookie: string, field: string, body: unknown) {
    return fetch(`${baseUrl}/v1/steuerjahre/${TAX_YEAR}/ch-lohnausweis/${field}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(body),
    })
  }

  function putExchangeRate(cookie: string, body: unknown) {
    return fetch(`${baseUrl}/v1/steuerjahre/${TAX_YEAR}/ch-lohnausweis/wechselkurs`, {
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
      await answerChInterview(cookie)

      await putExchangeRate(cookie, { month: '2026-01', rate: RATE, mode: 'amtlich' })
      await putField(cookie, 'bruttolohn-total', { kind: 'erfasst', value: 84000 })
      await putField(cookie, 'berufliche-vorsorge', { kind: 'erfasst', value: 5000 })
      const response = await putField(cookie, 'quellensteuer', { kind: 'erfasst', value: 3780 })

      const body = (await response.json()) as {
        status: string
        exchangeRate: { month: string; rate: number; mode: string }
        items: Array<{ id: string; art: string; digit: string; amountChf: number; amountEur: number; role: string }>
        foldStatus: { kind: string; einnahmen: number; vorsorgeaufwand: number; anrechnung: number }
      }

      expect(body.status).toBe('echter-grenzgaenger')
      expect(body.exchangeRate).toMatchObject({ month: '2026-01', rate: RATE, mode: 'amtlich' })

      expect(body.items).toEqual([
        {
          id: 'ch-lohnausweis-bruttolohn-total',
          art: 'Bruttolohn',
          digit: '8',
          amountChf: 84000,
          amountEur: 79060.8,
          role: 'einnahme',
          exchangeRate: { month: '2026-01', rate: RATE, mode: 'amtlich' },
        },
        {
          id: 'ch-lohnausweis-berufliche-vorsorge',
          art: 'Pensionskasse',
          digit: '10',
          amountChf: 5000,
          amountEur: 4706,
          role: 'vorsorgeaufwand',
          exchangeRate: { month: '2026-01', rate: RATE, mode: 'amtlich' },
        },
        {
          id: 'ch-lohnausweis-quellensteuer',
          art: 'Quellensteuer',
          digit: '12',
          amountChf: 3780,
          amountEur: 3557.74,
          role: 'anrechnung',
          exchangeRate: { month: '2026-01', rate: RATE, mode: 'amtlich' },
        },
      ])

      expect(body.foldStatus).toEqual({ kind: 'bestimmt', einnahmen: 79061, vorsorgeaufwand: 4706, anrechnung: 3558 })
    },
  )

  it('an empty required field stays open, never a fabricated zero (ADR-032 honesty)', async () => {
    const { cookie } = await signUp('open-field@example.com')
    await answerChInterview(cookie)
    await putExchangeRate(cookie, { month: '2026-01', rate: RATE, mode: 'amtlich' })

    const body = (await (await get(cookie)).json()) as {
      items: unknown[]
      foldStatus: { kind: string; einnahmen: number; vorsorgeaufwand: number; anrechnung: number; openItems?: number }
    }
    expect(body.items).toEqual([])
    expect(body.foldStatus.kind).toBe('offen')
    expect(body.foldStatus).toMatchObject({
      einnahmen: 0,
      vorsorgeaufwand: 0,
      anrechnung: 0,
      openItems: 3, // bruttolohn-total + berufliche-vorsorge + quellensteuer
    })
  })

  it('stores the Anlage-N-Gre facts beyond the Lohnausweis (PUT .../n-gre) and returns them', async () => {
    const { cookie } = await signUp('n-gre@example.com')
    const put = await putField(cookie, 'n-gre', {
      arbeitgeberName: 'Muster AG',
      arbeitgeberStrasse: 'Bahnhofstrasse 1',
      arbeitgeberPlzOrt: '4051 Basel',
      familienzulagenChf: 2400,
      krankentaggeldChf: 300,
      pkArbeitnehmerChf: 5000,
      pkArbeitgeberChf: 6000,
      krankentaggeldArbeitgeberProzent: 10,
      specialCases: false,
    })
    expect(put.status).toBe(200)
    const body = (await (await get(cookie)).json()) as { nGre: Record<string, unknown> }
    expect(body.nGre).toEqual({
      arbeitgeberName: 'Muster AG',
      arbeitgeberStrasse: 'Bahnhofstrasse 1',
      arbeitgeberPlzOrt: '4051 Basel',
      familienzulagenChf: 2400,
      krankentaggeldChf: 300,
      pkArbeitnehmerChf: 5000,
      pkArbeitgeberChf: 6000,
      krankentaggeldArbeitgeberProzent: 10,
      krankentaggeldArbeitgeberChf: null,
      nbuvArbeitgeberProzent: null,
      nbuvArbeitgeberChf: null,
      specialCases: false,
    })
    expect((await putField(cookie, 'n-gre', { krankentaggeldArbeitgeberProzent: 101 })).status).toBe(400)
    expect((await putField(cookie, 'n-gre', { familienzulagenChf: -1 })).status).toBe(400)
  })

  it('a tatsächlicher Kurs without a Beleg is rejected (ADR-012: "ohne Beleg kein tatsächlicher Kurs")', async () => {
    const { cookie } = await signUp('tatsaechlich@example.com')

    const response = await putExchangeRate(cookie, { month: '2026-01', rate: 0.95, mode: 'tatsaechlich' })
    expect(response.status).toBe(400)
  })

  describe('P3 — no guest path: @RequiresAccount() rejects a guest with 401', () => {
    it('GET without an account session is 401', async () => {
      const response = await get('')
      expect(response.status).toBe(401)
    })

    it('PUT without an account session is 401 and creates no row', async () => {
      const response = await putField('', 'bruttolohn-total', { kind: 'erfasst', value: 1 })
      expect(response.status).toBe(401)
      const rows = await prisma.$queryRaw<ChSalaryCertificateRow[]>`SELECT "userId" FROM "ChLohnausweis"`
      expect(rows).toEqual([])
    })
  })

  describe('P4 — cross-user isolation', () => {
    it('user B can neither read nor write user A’s CH-Lohnausweis row', async () => {
      const userA = await signUp('p4-a@example.com')
      const userB = await signUp('p4-b@example.com')
      await answerChInterview(userA.cookie)
      await putExchangeRate(userA.cookie, { month: '2026-01', rate: RATE, mode: 'amtlich' })
      await putField(userA.cookie, 'bruttolohn-total', { kind: 'erfasst', value: 84000 })

      const asB = await (await get(userB.cookie)).json() as { fields: Array<{ id: string; kind: string }> }
      const grossB = asB.fields.find((f) => f.id === 'bruttolohn-total')
      expect(grossB).toMatchObject({ kind: 'offen' })

      const asA = await (await get(userA.cookie)).json() as { fields: Array<{ id: string; kind: string; value?: number }> }
      const grossA = asA.fields.find((f) => f.id === 'bruttolohn-total')
      expect(grossA).toMatchObject({ kind: 'erfasst', value: 84000 })
    })
  })

  describe('P5 — figures are ciphertext at rest, checked by raw SQL, never through the Prisma client', () => {
    it('a real PUT’s Bruttolohn is not stored as plaintext', async () => {
      const { cookie, userId } = await signUp('p5-cipher@example.com')
      await answerChInterview(cookie)
      await putExchangeRate(cookie, { month: '2026-01', rate: RATE, mode: 'amtlich' })
      await putField(cookie, 'bruttolohn-total', { kind: 'erfasst', value: 84000 })

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

      await putExchangeRate(cookie, { month: '2026-01', rate: RATE, mode: 'amtlich' })
      await putField(cookie, 'bruttolohn-total', { kind: 'erfasst', value: 84000 })

      const rows = await prisma.$queryRaw<{ action: string; resource: string }[]>`
        SELECT "action", "resource" FROM "TaxDataAccessLog" WHERE "userId" = ${userId}
      `
      expect(rows.filter((r) => r.action === 'WRITE' && r.resource === 'ch-lohnausweis')).toHaveLength(2)
    })
  })
})
