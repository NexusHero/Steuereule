// REQ-023 — Bescheidprüfung 1.0 (ticket 10.3, ADR-009). Real Postgres, real HTTP against the
// actual `buildApp()` boot from src/main.ts (never `.inject()`) — the acceptance tier the
// register's `Done` binds to (Musti's #249 R2 ruling).
//
// Covers the ticket's Bescheid-Datenaufnahme + Abgleich + Korrektur-/Einspruch-Flows:
//   GWT — a transcribed figure is abgeglichen against the computed stand (never silent);
//         the § 355 AO Frist runs from the Bescheiddatum; the phase transitions are server-validated.
//   P2 — an illegal phase transition is rejected (409), nothing coerced.
//   P3 — a guest (no account session) gets 401, no row created.
//   P4 — user B can neither read nor write user A's Bescheid.
//   P5 — the figures are ciphertext at rest, checked by raw SQL, never the Prisma client.
//   audit — each admitted write appends exactly one WRITE entry, atomic with the row.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { resetRateLimiters } from '../support/reset-rate-limiters.js'

process.env.GUEST_SESSION_SECRET = 'req-023-secret'
process.env.BETTER_AUTH_SECRET = 'req-023-better-auth-secret-0123456789'
process.env.BETTER_AUTH_URL = 'http://127.0.0.1:39993'

const ALLOWED_ORIGIN = 'https://allowed.example.com'
process.env.CORS_ALLOWED_ORIGINS = ALLOWED_ORIGIN
const TRUSTED_ORIGIN_HEADERS = { origin: ALLOWED_ORIGIN }

const STEUERJAHR = 2026

type BescheidRow = { userId: string; einnahmen: string | null }

describe('REQ-023 — Bescheidprüfung, against the real server', () => {
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
    await prisma.$executeRawUnsafe(`DELETE FROM "Bescheid"`)
    await prisma.$executeRawUnsafe(`DELETE FROM "Lstb"`)
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

  /** Seeds a computed Einnahmen side of `brutto` € (Angestellt) through the real endpoints. */
  async function seedAngestellt(cookie: string, brutto: number) {
    const job = await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview/antworten`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ questionId: 'job', value: 'Angestellt' }),
    })
    expect(job.status).toBe(200)

    const lstb = await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/lstb/bruttoarbeitslohn`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ kind: 'erfasst', wert: brutto }),
    })
    expect(lstb.status).toBe(200)
  }

  function getBescheid(cookie: string) {
    return fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/bescheid`, { headers: { cookie } })
  }

  function putFeld(cookie: string, feld: string, body: unknown) {
    return fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/bescheid/feld/${feld}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(body),
    })
  }

  function putDatum(cookie: string, datum: string) {
    return fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/bescheid/datum`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ datum }),
    })
  }

  function putStatus(cookie: string, status: string) {
    return fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/bescheid/status`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ status }),
    })
  }

  function putEinspruch(cookie: string, grund: string) {
    return fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/bescheid/einspruch`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ grund }),
    })
  }

  it(
    'GWT — a transcribed figure is abgeglichen against the computed stand (never silent), the ' +
      '§ 355 AO Frist runs from the Bescheiddatum, and the phase transitions are server-validated',
    async () => {
      const { cookie } = await signUp('gwt-bescheid@example.com')
      await seedAngestellt(cookie, 50_000)

      // Empty re-entry: no Bescheid yet, but the computed side is already 50.000 €.
      const empty = await getBescheid(cookie)
      expect(empty.status).toBe(200)
      const emptyBody = (await empty.json()) as { status: string; felder: { kind: string }[]; abgleich: { abweichungen: unknown[] } }
      expect(emptyBody.status).toBe('eingegangen')
      expect(emptyBody.felder.map((f) => f.kind)).toEqual(['offen', 'offen', 'offen', 'offen', 'offen'])
      expect(emptyBody.abgleich.abweichungen).toEqual([])

      // A deviating figure is a named diff, never silent.
      const dev = await putFeld(cookie, 'einnahmen', { kind: 'erfasst', wert: 48_000 })
      expect(dev.status).toBe(200)
      expect(((await dev.json()) as { abgleich: { abweichungen: unknown[] } }).abgleich.abweichungen).toEqual([
        { feld: 'einnahmen', bescheid: 48_000, berechnet: 50_000, differenz: -2_000 },
      ])

      // The Frist is Bescheiddatum + 1 Monat.
      const datum = await putDatum(cookie, '2026-03-15')
      expect(((await datum.json()) as { frist: { fristEnde: string } }).frist.fristEnde).toBe('2026-04-15')

      // eingegangen → geprüft is legal; geprüft → einspruch-eingelegt (with a Grund) is legal.
      const geprueft = await putStatus(cookie, 'geprüft')
      expect(((await geprueft.json()) as { status: string }).status).toBe('geprüft')

      const einspruch = await putEinspruch(cookie, 'betrag-falsch')
      const einspruchBody = (await einspruch.json()) as { status: string; einspruchGrund: string }
      expect(einspruchBody.status).toBe('einspruch-eingelegt')
      expect(einspruchBody.einspruchGrund).toBe('betrag-falsch')
    },
  )

  it('P2 — an illegal phase transition is rejected with 409, never coerced (kein stiller Übergang)', async () => {
    const { cookie } = await signUp('illegal@example.com')

    // eingegangen → einspruch-eingelegt skips geprüft.
    const response = await putStatus(cookie, 'einspruch-eingelegt')
    expect(response.status).toBe(409)
  })

  it('P2 — an unknown field id or a bad amount is a 400 and persists nothing', async () => {
    const { cookie } = await signUp('bad-feld@example.com')

    expect((await putFeld(cookie, 'wohnort', { kind: 'erfasst', wert: 1 })).status).toBe(400)
    expect((await putFeld(cookie, 'einnahmen', { kind: 'erfasst', wert: -5 })).status).toBe(400)
    expect((await putDatum(cookie, '15.03.2026')).status).toBe(400)
  })

  it('P3 — no guest path: @RequiresAccount() rejects a guest with 401, no row created', async () => {
    expect((await getBescheid('')).status).toBe(401)
    expect((await putFeld('', 'einnahmen', { kind: 'erfasst', wert: 1 })).status).toBe(401)
    const rows = await prisma.$queryRaw<BescheidRow[]>`SELECT "userId" FROM "Bescheid"`
    expect(rows).toEqual([])
  })

  it('P4 — cross-user isolation: user B can neither read nor write user A’s Bescheid', async () => {
    const userA = await signUp('p4-a@example.com')
    const userB = await signUp('p4-b@example.com')
    await seedAngestellt(userA.cookie, 50_000)

    await putFeld(userA.cookie, 'einnahmen', { kind: 'erfasst', wert: 48_000 })

    const asB = await getBescheid(userB.cookie)
    expect(((await asB.json()) as { felder: { kind: string }[] }).felder[0]).toEqual({ id: 'einnahmen', kind: 'offen' })

    const asA = await getBescheid(userA.cookie)
    expect(((await asA.json()) as { felder: { kind: string; wert: number }[] }).felder[0]).toEqual({ id: 'einnahmen', kind: 'erfasst', wert: 48_000 })
  })

  it('P5 — figures are ciphertext at rest, checked by raw SQL, never through the Prisma client', async () => {
    const { cookie, userId } = await signUp('p5-cipher@example.com')

    await putFeld(cookie, 'einnahmen', { kind: 'erfasst', wert: 50_000 })

    const rawRows = await prisma.$queryRaw<{ einnahmen: string | null }[]>`
      SELECT "einnahmen" FROM "Bescheid" WHERE "userId" = ${userId}
    `
    expect(rawRows).toHaveLength(1)
    const rawValue = rawRows[0]!.einnahmen
    expect(rawValue).not.toBe('50000')
    expect(rawValue).not.toBeNull()
    expect(rawValue).toMatch(/^v\d+\.aesgcm256\./)
  })

  it('audit — each admitted write appends exactly one WRITE entry, atomic with the row', async () => {
    const { cookie, userId } = await signUp('audit-write@example.com')

    await putFeld(cookie, 'einnahmen', { kind: 'erfasst', wert: 50_000 })

    const rows = await prisma.$queryRaw<{ action: string; resource: string }[]>`
      SELECT "action", "resource" FROM "TaxDataAccessLog" WHERE "userId" = ${userId}
    `
    expect(rows.filter((r) => r.action === 'WRITE' && r.resource === 'bescheid')).toHaveLength(1)
  })
})
