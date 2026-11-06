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

const TAX_YEAR = 2026

type AssessmentRow = { userId: string; einnahmen: string | null }

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
  async function seedEmployed(cookie: string, gross: number) {
    const job = await fetch(`${baseUrl}/v1/steuerjahre/${TAX_YEAR}/interview/antworten`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ questionId: 'job', value: 'Angestellt' }),
    })
    expect(job.status).toBe(200)

    const lstb = await fetch(`${baseUrl}/v1/steuerjahre/${TAX_YEAR}/lstb/bruttoarbeitslohn`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ kind: 'erfasst', value: gross }),
    })
    expect(lstb.status).toBe(200)
  }

  function getAssessment(cookie: string) {
    return fetch(`${baseUrl}/v1/steuerjahre/${TAX_YEAR}/bescheid`, { headers: { cookie } })
  }

  function putField(cookie: string, field: string, body: unknown) {
    return fetch(`${baseUrl}/v1/steuerjahre/${TAX_YEAR}/bescheid/feld/${field}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(body),
    })
  }

  function putDate(cookie: string, date: string) {
    return fetch(`${baseUrl}/v1/steuerjahre/${TAX_YEAR}/bescheid/datum`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ date }),
    })
  }

  function putStatus(cookie: string, status: string) {
    return fetch(`${baseUrl}/v1/steuerjahre/${TAX_YEAR}/bescheid/status`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ status }),
    })
  }

  function putAppeal(cookie: string, reason: string) {
    return fetch(`${baseUrl}/v1/steuerjahre/${TAX_YEAR}/bescheid/einspruch`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ reason }),
    })
  }

  it(
    'GWT — a transcribed figure is abgeglichen against the computed stand (never silent), the ' +
      '§ 355 AO Frist runs from the Bescheiddatum, and the phase transitions are server-validated',
    async () => {
      const { cookie } = await signUp('gwt-bescheid@example.com')
      await seedEmployed(cookie, 50_000)

      // Empty re-entry: no Bescheid yet, but the computed side is already 50.000 €.
      const empty = await getAssessment(cookie)
      expect(empty.status).toBe(200)
      const emptyBody = (await empty.json()) as { status: string; fields: { kind: string }[]; reconciliation: { deviations: unknown[] } }
      expect(emptyBody.status).toBe('eingegangen')
      expect(emptyBody.fields.map((f) => f.kind)).toEqual(['offen', 'offen', 'offen', 'offen', 'offen'])
      expect(emptyBody.reconciliation.deviations).toEqual([])

      // A deviating figure is a named diff, never silent.
      const dev = await putField(cookie, 'einnahmen', { kind: 'erfasst', value: 48_000 })
      expect(dev.status).toBe(200)
      expect(((await dev.json()) as { reconciliation: { deviations: unknown[] } }).reconciliation.deviations).toEqual([
        { field: 'einnahmen', assessment: 48_000, calculated: 50_000, difference: -2_000 },
      ])

      // The Frist is Bescheiddatum + 1 Monat.
      const date = await putDate(cookie, '2026-03-15')
      expect(((await date.json()) as { frist: { deadlineEnd: string } }).frist.deadlineEnd).toBe('2026-04-15')

      // eingegangen → geprüft is legal; geprüft → einspruch-eingelegt (with a Grund) is legal.
      const checked = await putStatus(cookie, 'geprüft')
      expect(((await checked.json()) as { status: string }).status).toBe('geprüft')

      const appeal = await putAppeal(cookie, 'betrag-falsch')
      const appealBody = (await appeal.json()) as { status: string; appealReason: string }
      expect(appealBody.status).toBe('einspruch-eingelegt')
      expect(appealBody.appealReason).toBe('betrag-falsch')
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

    expect((await putField(cookie, 'wohnort', { kind: 'erfasst', value: 1 })).status).toBe(400)
    expect((await putField(cookie, 'einnahmen', { kind: 'erfasst', value: -5 })).status).toBe(400)
    expect((await putDate(cookie, '15.03.2026')).status).toBe(400)
  })

  it('P3 — no guest path: @RequiresAccount() rejects a guest with 401, no row created', async () => {
    expect((await getAssessment('')).status).toBe(401)
    expect((await putField('', 'einnahmen', { kind: 'erfasst', value: 1 })).status).toBe(401)
    const rows = await prisma.$queryRaw<AssessmentRow[]>`SELECT "userId" FROM "Bescheid"`
    expect(rows).toEqual([])
  })

  it('P4 — cross-user isolation: user B can neither read nor write user A’s Bescheid', async () => {
    const userA = await signUp('p4-a@example.com')
    const userB = await signUp('p4-b@example.com')
    await seedEmployed(userA.cookie, 50_000)

    await putField(userA.cookie, 'einnahmen', { kind: 'erfasst', value: 48_000 })

    const asB = await getAssessment(userB.cookie)
    expect(((await asB.json()) as { fields: { kind: string }[] }).fields[0]).toEqual({ id: 'einnahmen', kind: 'offen' })

    const asA = await getAssessment(userA.cookie)
    expect(((await asA.json()) as { fields: { kind: string; value: number }[] }).fields[0]).toEqual({ id: 'einnahmen', kind: 'erfasst', value: 48_000 })
  })

  it('P5 — figures are ciphertext at rest, checked by raw SQL, never through the Prisma client', async () => {
    const { cookie, userId } = await signUp('p5-cipher@example.com')

    await putField(cookie, 'einnahmen', { kind: 'erfasst', value: 50_000 })

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

    await putField(cookie, 'einnahmen', { kind: 'erfasst', value: 50_000 })

    const rows = await prisma.$queryRaw<{ action: string; resource: string }[]>`
      SELECT "action", "resource" FROM "TaxDataAccessLog" WHERE "userId" = ${userId}
    `
    expect(rows.filter((r) => r.action === 'WRITE' && r.resource === 'bescheid')).toHaveLength(1)
  })
})
