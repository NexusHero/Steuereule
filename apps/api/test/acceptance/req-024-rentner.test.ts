// REQ-022 — the Rentner vertical (product ADR-034, Anlage R), ticket 10.4. Real Postgres, real
// HTTP against the actual `buildApp()` boot (never `.inject()`) — the acceptance tier the
// register's `Done` binds to (Musti's #249 R2 ruling).
//
// Covers the ticket's core: a Rentner transcribes their Rentenbezugsmitteilung (Rentenart +
// Jahresbetrag + Rentenbeginn-Jahr or -Lebensalter), and the taxable share folds through the
// deterministic core with Herkunft — Besteuerungsanteil by Rentenbeginn-Jahr (aa) or Ertragsanteil
// by Lebensalter (bb). An empty required field stays open, never a fabricated zero (ADR-032); a
// Rentenbeginn-Jahr outside the statutory table is offen, never guessed; and the figures are
// ciphertext at rest (ADR-0008).
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { resetRateLimiters } from '../support/reset-rate-limiters.js'

process.env.GUEST_SESSION_SECRET = 'req-022-secret'
process.env.BETTER_AUTH_SECRET = 'req-022-better-auth-secret-0123456789'
process.env.BETTER_AUTH_URL = 'http://127.0.0.1:39993'

const ALLOWED_ORIGIN = 'https://allowed.example.com'
process.env.CORS_ALLOWED_ORIGINS = ALLOWED_ORIGIN
const TRUSTED_ORIGIN_HEADERS = { origin: ALLOWED_ORIGIN }

const STEUERJAHR = 2026

type RenteRow = { userId: string; jahresbetrag: string | null }

describe('REQ-024 — the Rentner vertical (Anlage R), against the real server', () => {
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
    await prisma.$executeRawUnsafe(`DELETE FROM "Rente"`)
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

  function get(cookie: string) {
    return fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/rente`, { headers: { cookie } })
  }

  function putArt(cookie: string, art: string | null) {
    return fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/rente/art`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ art }),
    })
  }

  function putFeld(cookie: string, feld: string, body: unknown) {
    return fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/rente/${feld}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(body),
    })
  }

  it(
    'GWT — a gesetzliche Rente folds through the core: Jahresbetrag × Besteuerungsanteil, with Herkunft',
    async () => {
      const { cookie } = await signUp('gwt-rente@example.com')
      await putArt(cookie, 'GesetzlicheRente')
      await putFeld(cookie, 'jahresbetrag', { kind: 'erfasst', wert: 20000 })
      const response = await putFeld(cookie, 'rentenbeginnJahr', { kind: 'erfasst', wert: 2020 })

      const body = (await response.json()) as {
        art: string
        posten: Array<{ id: string; betrag: number; herkunft: string }>
        stand: { kind: string; einnahmen: number; vorsorgeaufwand: number; anrechnung: number }
      }

      expect(body.art).toBe('GesetzlicheRente')
      expect(body.posten).toEqual([
        { id: 'rente', betrag: 16000, herkunft: '§ 22 Nr. 1 Satz 3 Buchst. a Doppelbuchst. aa EStG — Besteuerungsanteil bei Rentenbeginn 2020: 80 %' },
      ])
      expect(body.stand).toEqual({ kind: 'bestimmt', einnahmen: 16000, vorsorgeaufwand: 0, anrechnung: 0 })
    },
  )

  it('a private Rentenversicherung folds via the Ertragsanteil (bb), citing the age table', async () => {
    const { cookie } = await signUp('private-rente@example.com')
    await putArt(cookie, 'PrivateRentenversicherung')
    await putFeld(cookie, 'jahresbetrag', { kind: 'erfasst', wert: 10000 })
    const response = await putFeld(cookie, 'alterBeiRentenbeginn', { kind: 'erfasst', wert: 65 })

    const body = (await response.json()) as { posten: Array<{ betrag: number; herkunft: string }>; stand: { kind: string; einnahmen: number } }
    expect(body.posten[0]?.betrag).toBe(1800)
    expect(body.posten[0]?.herkunft).toBe('§ 22 Nr. 1 Satz 3 Buchst. a Doppelbuchst. bb EStG — Ertragsanteil bei Rentenbeginn mit 65 Jahren: 18 %')
    expect(body.stand).toEqual({ kind: 'bestimmt', einnahmen: 1800, vorsorgeaufwand: 0, anrechnung: 0 })
  })

  it('an empty required field stays open, never a fabricated zero (ADR-032 honesty)', async () => {
    const { cookie } = await signUp('open-rente@example.com')
    await putArt(cookie, 'GesetzlicheRente')

    const body = (await (await get(cookie)).json()) as {
      posten: unknown[]
      stand: { kind: string; einnahmen: number; offenePosten?: number }
    }
    expect(body.posten).toEqual([])
    expect(body.stand.kind).toBe('offen')
    expect(body.stand).toMatchObject({ einnahmen: 0, offenePosten: 1 })
  })

  it('a Rentenbeginn-Jahr outside the statutory table is offen, never guessed', async () => {
    const { cookie } = await signUp('out-of-table@example.com')
    await putArt(cookie, 'GesetzlicheRente')
    await putFeld(cookie, 'jahresbetrag', { kind: 'erfasst', wert: 20000 })
    const response = await putFeld(cookie, 'rentenbeginnJahr', { kind: 'erfasst', wert: 2070 })

    const body = (await response.json()) as { posten: unknown[]; stand: { kind: string; offenePosten?: number } }
    expect(body.posten).toEqual([])
    expect(body.stand).toMatchObject({ kind: 'offen', offenePosten: 1 })
  })

  describe('P3 — no guest path: @RequiresAccount() rejects a guest with 401', () => {
    it('GET without an account session is 401', async () => {
      const response = await get('')
      expect(response.status).toBe(401)
    })

    it('PUT without an account session is 401 and creates no row', async () => {
      const response = await putFeld('', 'jahresbetrag', { kind: 'erfasst', wert: 1 })
      expect(response.status).toBe(401)
      const rows = await prisma.$queryRaw<RenteRow[]>`SELECT "userId" FROM "Rente"`
      expect(rows).toEqual([])
    })
  })

  describe('P4 — cross-user isolation', () => {
    it('user B can neither read nor write user A’s Rente row', async () => {
      const userA = await signUp('p4-a@example.com')
      const userB = await signUp('p4-b@example.com')
      await putArt(userA.cookie, 'GesetzlicheRente')
      await putFeld(userA.cookie, 'jahresbetrag', { kind: 'erfasst', wert: 20000 })

      const asB = (await (await get(userB.cookie)).json()) as { art: string | null; jahresbetrag: { kind: string } }
      expect(asB.art).toBeNull()
      expect(asB.jahresbetrag).toEqual({ kind: 'offen' })

      const asA = (await (await get(userA.cookie)).json()) as { art: string | null; jahresbetrag: { kind: string; wert?: number } }
      expect(asA.art).toBe('GesetzlicheRente')
      expect(asA.jahresbetrag).toEqual({ kind: 'erfasst', wert: 20000 })
    })
  })

  describe('P5 — figures are ciphertext at rest, checked by raw SQL, never through the Prisma client', () => {
    it('a real PUT’s Jahresbetrag is not stored as plaintext', async () => {
      const { cookie, userId } = await signUp('p5-cipher@example.com')
      await putArt(cookie, 'GesetzlicheRente')
      await putFeld(cookie, 'jahresbetrag', { kind: 'erfasst', wert: 20000 })

      const rawRows = await prisma.$queryRaw<RenteRow[]>`SELECT "jahresbetrag" FROM "Rente" WHERE "userId" = ${userId}`
      expect(rawRows).toHaveLength(1)
      const rawValue = rawRows[0]!.jahresbetrag
      expect(rawValue).not.toBe('20000')
      expect(rawValue).not.toBeNull()
      expect(rawValue).toMatch(/^v\d+\.aesgcm256\./)
    })
  })

  describe('audit trail (ADR-0008) — the same house pattern as Profile/Lstb', () => {
    it('each admitted write appends exactly one WRITE audit entry, atomic with the row', async () => {
      const { cookie, userId } = await signUp('audit-write@example.com')

      await putArt(cookie, 'GesetzlicheRente')
      await putFeld(cookie, 'jahresbetrag', { kind: 'erfasst', wert: 20000 })

      const rows = await prisma.$queryRaw<{ action: string; resource: string }[]>`
        SELECT "action", "resource" FROM "TaxDataAccessLog" WHERE "userId" = ${userId}
      `
      expect(rows.filter((r) => r.action === 'WRITE' && r.resource === 'rente')).toHaveLength(2)
    })
  })
})
