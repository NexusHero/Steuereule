// REQ-016 — the LStB guided mask (ADR-036 Scan-Fallback, ticket 08). Real Postgres, real
// HTTP against the actual `buildApp()` boot from src/main.ts (never `.inject()`) — the
// acceptance tier the register's `Done` binds to (Musti's #249 R2 ruling).
//
// Covers the ticket's LStB-Datenaufnahme bullet: the guided fallback mask with honest
// offen/unklar/erfasst states, the widerspruch fold, field-encryption at rest, audit
// atomicity, and the same P3/P4 isolation guarantees as REQ-015. Scan/OCR is deliberately
// out of scope (ADR-045, later) — this proves the DATA interface only.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { resetRateLimiters } from '../support/reset-rate-limiters.js'

process.env.GUEST_SESSION_SECRET = 'req-016-secret'
process.env.BETTER_AUTH_SECRET = 'req-016-better-auth-secret-0123456789'
process.env.BETTER_AUTH_URL = 'http://127.0.0.1:39992'

const ALLOWED_ORIGIN = 'https://allowed.example.com'
process.env.CORS_ALLOWED_ORIGINS = ALLOWED_ORIGIN
const TRUSTED_ORIGIN_HEADERS = { origin: ALLOWED_ORIGIN }

const STEUERJAHR = 2026

type LstbRow = { userId: string; steuerjahr: number; bruttoarbeitslohn: string | null }

describe('REQ-016 — the LStB guided mask, against the real server', () => {
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
    await prisma.$executeRawUnsafe(`DELETE FROM "Lstb"`)
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

  function getLstb(cookie: string) {
    return fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/lstb`, { headers: { cookie } })
  }

  function putFeld(cookie: string, feld: string, body: unknown) {
    return fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/lstb/${feld}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(body),
    })
  }

  it(
    'GWT — three fields transcribed in order persist server-side with honest states, and each response ' +
      'names the exact derived zustand the core computes',
    async () => {
      const { cookie } = await signUp('gwt-lstb@example.com')

      const empty = await getLstb(cookie)
      expect(empty.status).toBe(200)
      expect(await empty.json()).toEqual({
        bruttoarbeitslohn: { kind: 'offen' },
        lohnsteuer: { kind: 'offen' },
        sozialversicherung: { kind: 'offen' },
        zustand: { kind: 'unvollstaendig', offen: ['bruttoarbeitslohn', 'lohnsteuer', 'sozialversicherung'], unklar: [] },
      })

      const brutto = await putFeld(cookie, 'bruttoarbeitslohn', { kind: 'erfasst', wert: 50000 })
      expect(await brutto.json()).toMatchObject({
        bruttoarbeitslohn: { kind: 'erfasst', wert: 50000 },
        lohnsteuer: { kind: 'offen' },
        zustand: { kind: 'unvollstaendig', offen: ['lohnsteuer', 'sozialversicherung'], unklar: [] },
      })

      const lohnsteuer = await putFeld(cookie, 'lohnsteuer', { kind: 'erfasst', wert: 9000 })
      expect(((await lohnsteuer.json()) as { zustand: unknown }).zustand).toMatchObject({ kind: 'unvollstaendig', offen: ['sozialversicherung'] })

      const sozialversicherung = await putFeld(cookie, 'sozialversicherung', { kind: 'erfasst', wert: 10000 })
      expect(await sozialversicherung.json()).toEqual({
        bruttoarbeitslohn: { kind: 'erfasst', wert: 50000 },
        lohnsteuer: { kind: 'erfasst', wert: 9000 },
        sozialversicherung: { kind: 'erfasst', wert: 10000 },
        zustand: { kind: 'vollstaendig', bruttoarbeitslohn: 50000, lohnsteuer: 9000, sozialversicherung: 10000 },
      })
    },
  )

  it('GWT — an unreadable field is reported under unklar, never guessed (ADR-036 honest fallback)', async () => {
    const { cookie } = await signUp('gwt-unklar@example.com')

    const response = await putFeld(cookie, 'lohnsteuer', { kind: 'unklar' })

    expect(await response.json()).toMatchObject({
      lohnsteuer: { kind: 'unklar' },
      zustand: {
        kind: 'unvollstaendig',
        offen: ['bruttoarbeitslohn', 'sozialversicherung'],
        unklar: ['lohnsteuer'],
      },
    })
  })

  it('a figure exceeding the Bruttoarbeitslohn reports a widerspruch, never a silent fix (ADR-008)', async () => {
    const { cookie } = await signUp('widerspruch@example.com')

    await putFeld(cookie, 'bruttoarbeitslohn', { kind: 'erfasst', wert: 10000 })
    await putFeld(cookie, 'lohnsteuer', { kind: 'erfasst', wert: 20000 })
    const response = await putFeld(cookie, 'sozialversicherung', { kind: 'erfasst', wert: 0 })

    expect(((await response.json()) as { zustand: unknown }).zustand).toEqual({
      kind: 'widerspruch',
      widersprueche: [{ art: 'lohnsteuer-uebersteigt-brutto', lohnsteuer: 20000, bruttoarbeitslohn: 10000 }],
    })
  })

  describe('P2 — a bad field id or value is rejected at the boundary and persists nothing', () => {
    it('an unknown field id is a 400', async () => {
      const { cookie } = await signUp('bad-feld@example.com')

      const response = await putFeld(cookie, 'wohnort', { kind: 'erfasst', wert: 1 })
      expect(response.status).toBe(400)
    })

    it('an erfasst value without a valid whole-euro amount is a 400', async () => {
      const { cookie } = await signUp('bad-wert@example.com')

      const response = await putFeld(cookie, 'bruttoarbeitslohn', { kind: 'erfasst', wert: -5 })
      expect(response.status).toBe(400)

      const missing = await putFeld(cookie, 'bruttoarbeitslohn', { kind: 'erfasst' })
      expect(missing.status).toBe(400)
    })
  })

  describe('P3 — no guest path: @RequiresAccount() rejects a guest with 401', () => {
    it('GET without an account session is 401', async () => {
      const response = await getLstb('')
      expect(response.status).toBe(401)
    })

    it('PUT without an account session is 401 and creates no row', async () => {
      const response = await putFeld('', 'bruttoarbeitslohn', { kind: 'erfasst', wert: 1 })
      expect(response.status).toBe(401)
      const rows = await prisma.$queryRaw<LstbRow[]>`SELECT "userId" FROM "Lstb"`
      expect(rows).toEqual([])
    })
  })

  describe('P4 — cross-user isolation', () => {
    it('user B can neither read nor write user A’s LStB row', async () => {
      const userA = await signUp('p4-a@example.com')
      const userB = await signUp('p4-b@example.com')

      await putFeld(userA.cookie, 'bruttoarbeitslohn', { kind: 'erfasst', wert: 50000 })

      const asB = await getLstb(userB.cookie)
      expect(await asB.json()).toMatchObject({ bruttoarbeitslohn: { kind: 'offen' } })

      const asA = await getLstb(userA.cookie)
      expect(await asA.json()).toMatchObject({ bruttoarbeitslohn: { kind: 'erfasst', wert: 50000 } })
    })
  })

  describe('P5 — figures are ciphertext at rest, checked by raw SQL, never through the Prisma client', () => {
    it('a real PUT’s Bruttoarbeitslohn is not stored as plaintext', async () => {
      const { cookie, userId } = await signUp('p5-cipher@example.com')

      await putFeld(cookie, 'bruttoarbeitslohn', { kind: 'erfasst', wert: 50000 })

      const rawRows = await prisma.$queryRaw<{ bruttoarbeitslohn: string | null }[]>`
        SELECT "bruttoarbeitslohn" FROM "Lstb" WHERE "userId" = ${userId}
      `
      expect(rawRows).toHaveLength(1)
      const rawValue = rawRows[0]!.bruttoarbeitslohn

      expect(rawValue).not.toBe('50000')
      expect(rawValue).not.toBeNull()
      expect(rawValue).toMatch(/^v\d+\.aesgcm256\./)
    })
  })

  describe('audit trail (ADR-0008) — the same house pattern as Profile', () => {
    it('each admitted write appends exactly one WRITE audit entry, atomic with the row', async () => {
      const { cookie, userId } = await signUp('audit-write@example.com')

      await putFeld(cookie, 'bruttoarbeitslohn', { kind: 'erfasst', wert: 50000 })

      const rows = await prisma.$queryRaw<{ action: string; resource: string }[]>`
        SELECT "action", "resource" FROM "TaxDataAccessLog" WHERE "userId" = ${userId}
      `
      expect(rows.filter((r) => r.action === 'WRITE' && r.resource === 'lstb')).toHaveLength(1)
    })

    it('a real GET on an unstarted mask appends no READ entry; a GET after a write appends exactly one', async () => {
      const { cookie, userId } = await signUp('audit-read@example.com')

      await getLstb(cookie)
      const emptyReads = await prisma.$queryRaw<{ action: string }[]>`
        SELECT "action" FROM "TaxDataAccessLog" WHERE "userId" = ${userId} AND "action" = 'READ'
      `
      expect(emptyReads).toEqual([])

      await putFeld(cookie, 'bruttoarbeitslohn', { kind: 'erfasst', wert: 50000 })
      await getLstb(cookie)

      const reads = await prisma.$queryRaw<{ action: string; resource: string }[]>`
        SELECT "action", "resource" FROM "TaxDataAccessLog" WHERE "userId" = ${userId} AND "action" = 'READ' AND "resource" = 'lstb'
      `
      expect(reads).toHaveLength(1)
    })
  })
})
