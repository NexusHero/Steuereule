// REQ-026 — the Vermietung vertical (ticket 10.6, product ADR-033, Anlage V einfach). Real
// Postgres, real HTTP against the actual `buildApp()` boot (never `.inject()`) — the acceptance
// tier the register's `Done` binds to (Musti's #249 R2 ruling).
//
// Covers the ticket's core: a signed-in account holder manages several ganzjährig vermietete
// objects (je Objekt eine Anlage V) — Mieteinnahmen, Anschaffungskosten, Baujahr, Werbungskosten —
// and the core folds them: the Mieteinnahmen as Einnahme-Posten, the Werbungskosten and the
// lineare AfA (§ 7 Abs. 4 Satz 1 EStG: 2,5 %/2 %/3 % nach Baujahr) reported separately with
// Herkunft, never subtracted. An empty required field stays open, never a fabricated zero
// (ADR-032); Verkauf/möbliert stays gated (ADR-033); and the figures are ciphertext at rest
// (ADR-0008). The `vermietung-art` answer is seeded through the production encryption seam
// (ENCRYPTED_PRISMA) because Segment 2 is not yet admitted server-side (interview.service.ts
// ADMITTED_ENTRY_IDS) — the same rows the service reads in production.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { resetRateLimiters } from '../support/reset-rate-limiters.js'

process.env.GUEST_SESSION_SECRET = 'req-026-secret'
process.env.BETTER_AUTH_SECRET = 'req-026-better-auth-secret-0123456789'
process.env.BETTER_AUTH_URL = 'http://127.0.0.1:39996'

const ALLOWED_ORIGIN = 'https://allowed.example.com'
process.env.CORS_ALLOWED_ORIGINS = ALLOWED_ORIGIN
const TRUSTED_ORIGIN_HEADERS = { origin: ALLOWED_ORIGIN }

const STEUERJAHR = 2026

type VermietungRow = { userId: string; mieteinnahmen: string | null }

describe('REQ-026 — the Vermietung vertical (Anlage V einfach), against the real server', () => {
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

  function get(cookie: string) {
    return fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/vermietung`, { headers: { cookie } })
  }

  function create(cookie: string) {
    return fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/vermietung/objekte`, { method: 'POST', headers: { cookie } })
  }

  function putFeld(cookie: string, objektId: string, feld: string, body: unknown) {
    return fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/vermietung/objekte/${objektId}/${feld}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(body),
    })
  }

  /** Seed an interview answer through the production encryption seam (Segment 2 not yet admitted). */
  async function seedAnswer(userId: string, questionId: string, wert: string): Promise<void> {
    const { ENCRYPTED_PRISMA } = await import('../../src/prisma/encrypted-prisma.provider.js')
    const encrypted = app.get<{ interviewAnswer: { create: (input: { data: unknown }) => Promise<unknown> } }>(ENCRYPTED_PRISMA)
    await encrypted.interviewAnswer.create({ data: { userId, steuerjahr: STEUERJAHR, questionId, value: wert } })
  }

  it(
    'GWT — one complete object folds through the core: Mieteinnahmen + Werbungskosten + lineare AfA with § 7 Abs. 4 Herkunft',
    async () => {
      const { cookie, userId } = await signUp('gwt-vermietung@example.com')
      await seedAnswer(userId, 'vermietung-art', 'Einfach')
      const created = (await (await create(cookie)).json()) as { objekte: Array<{ id: string }> }
      const objektId = created.objekte[0]!.id

      await putFeld(cookie, objektId, 'mieteinnahmen', { kind: 'erfasst', wert: 12000 })
      await putFeld(cookie, objektId, 'anschaffungskosten', { kind: 'erfasst', wert: 200000 })
      await putFeld(cookie, objektId, 'baujahr', { kind: 'erfasst', wert: 1990 })
      const response = await putFeld(cookie, objektId, 'werbungskosten', { kind: 'erfasst', wert: 1500 })

      const body = (await response.json()) as {
        einordnung: { kind: string }
        objekte: Array<{ id: string; fakten: { einnahmen: number | null; werbungskosten: number | null; afa: { betrag: number; herkunft: string } | null; offenePosten: number } }>
        stand: { kind: string; einnahmen: number; werbungskosten: number; afa: number; offenePosten: number }
      }

      expect(body.einordnung).toEqual({ kind: 'einfach' })
      expect(body.objekte[0]?.fakten).toEqual({
        einnahmen: 12000,
        werbungskosten: 1500,
        afa: { betrag: 4000, herkunft: '§ 7 Abs. 4 Satz 1 EStG — lineare AfA 2 % bei Baujahr 1990' },
        offenePosten: 0,
      })
      expect(body.stand).toMatchObject({ kind: 'bestimmt', einnahmen: 12000, werbungskosten: 1500, afa: 4000, offenePosten: 0 })

      // Ciphertext at rest (ADR-0008): raw SQL shows the column is NOT the plaintext figure.
      const rows = await prisma.$queryRaw<VermietungRow[]>`SELECT "userId", "mieteinnahmen" FROM "Vermietungsobjekt" WHERE "userId" = ${userId}`
      expect(rows).toHaveLength(1)
      expect(rows[0]?.mieteinnahmen).not.toBe('12000')

      // The WRITE audit entries are appended atomically with every create/upsert (REQ-004).
      const audit = await prisma.$queryRaw<Array<{ action: string; resource: string }>>`SELECT "action", "resource" FROM "TaxDataAccessLog" WHERE "userId" = ${userId}`
      expect(audit.length).toBeGreaterThanOrEqual(5)
      expect(audit.every((entry) => entry.action === 'WRITE' && entry.resource === 'vermietung')).toBe(true)
    },
  )

  it('the AfA-Satz follows the three § 7 Abs. 4 bands (2,5 % / 2 % / 3 %) — never invented', async () => {
    const { cookie } = await signUp('afa-bands@example.com')
    const bands: Array<[number, number]> = [[1900, 2.5], [1990, 2], [2025, 3]]
    for (const [baujahr, prozent] of bands) {
      const created = (await (await create(cookie)).json()) as { objekte: Array<{ id: string }> }
      const objektId = created.objekte.at(-1)!.id
      await putFeld(cookie, objektId, 'mieteinnahmen', { kind: 'erfasst', wert: 12000 })
      await putFeld(cookie, objektId, 'anschaffungskosten', { kind: 'erfasst', wert: 100000 })
      const response = await putFeld(cookie, objektId, 'baujahr', { kind: 'erfasst', wert: baujahr })
      const body = (await response.json()) as { objekte: Array<{ fakten: { afa: { betrag: number; herkunft: string } | null } }> }
      expect(body.objekte.at(-1)?.fakten.afa).toEqual({
        betrag: Math.round(100000 * (prozent / 100)),
        herkunft: `§ 7 Abs. 4 Satz 1 EStG — lineare AfA ${prozent} % bei Baujahr ${baujahr}`,
      })
    }
  })

  it('an open field stays open — never a fabricated zero (ADR-032)', async () => {
    const { cookie } = await signUp('offen@example.com')
    const created = (await (await create(cookie)).json()) as { objekte: Array<{ id: string }> }
    const objektId = created.objekte[0]!.id

    const body = (await (await get(cookie)).json()) as { objekte: Array<{ fakten: { offenePosten: number } }>; stand: { kind: string; offenePosten: number } }
    expect(body.objekte[0]?.fakten.offenePosten).toBe(3)
    expect(body.stand).toMatchObject({ kind: 'offen', offenePosten: 3 })

    const unklar = await putFeld(cookie, objektId, 'mieteinnahmen', { kind: 'unklar' })
    const unklarBody = (await unklar.json()) as { objekte: Array<{ mieteinnahmen: { kind: string } }> }
    expect(unklarBody.objekte[0]?.mieteinnahmen).toEqual({ kind: 'unklar' })
  })

  it('several objects sum separately — je Objekt eine Anlage V', async () => {
    const { cookie } = await signUp('mehrere@example.com')
    for (const miete of [12000, 6000]) {
      const created = (await (await create(cookie)).json()) as { objekte: Array<{ id: string }> }
      const objektId = created.objekte.at(-1)!.id
      await putFeld(cookie, objektId, 'mieteinnahmen', { kind: 'erfasst', wert: miete })
      await putFeld(cookie, objektId, 'anschaffungskosten', { kind: 'erfasst', wert: 200000 })
      await putFeld(cookie, objektId, 'baujahr', { kind: 'erfasst', wert: 1990 })
      await putFeld(cookie, objektId, 'werbungskosten', { kind: 'erfasst', wert: 0 })
    }

    const body = (await (await get(cookie)).json()) as { objekte: unknown[]; stand: { kind: string; einnahmen: number; afa: number; offenePosten: number } }
    expect(body.objekte).toHaveLength(2)
    expect(body.stand).toMatchObject({ kind: 'bestimmt', einnahmen: 18000, afa: 8000, offenePosten: 0 })
  })

  it('Verkauf oder möbliert stays gated (ADR-033): the fold reads offen with the gate named', async () => {
    const { cookie, userId } = await signUp('verkauf@example.com')
    await seedAnswer(userId, 'einkuenfte', 'Vermietung')
    await seedAnswer(userId, 'vermietung-art', 'Verkauf oder möbliert')
    await create(cookie)

    const body = (await (await get(cookie)).json()) as { einordnung: { kind: string }; stand: { kind: string; gegated: string[] } }
    expect(body.einordnung).toEqual({ kind: 'verkauf-oder-moebliert' })
    expect(body.stand).toMatchObject({ kind: 'offen', gegated: ['Vermietung'] })
  })

  it('the endpoints require a real account session — a guest gets 401', async () => {
    const response = await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/vermietung`, { headers: TRUSTED_ORIGIN_HEADERS })
    expect(response.status).toBe(401)

    const createResponse = await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/vermietung/objekte`, { method: 'POST', headers: TRUSTED_ORIGIN_HEADERS })
    expect(createResponse.status).toBe(401)
  })

  it('is scoped strictly to userId — a foreign objektId is a 404, another account reads its own empty list', async () => {
    const { cookie: cookieA, userId: userA } = await signUp('scope-a@example.com')
    const { cookie: cookieB } = await signUp('scope-b@example.com')
    const created = (await (await create(cookieA)).json()) as { objekte: Array<{ id: string }> }
    const objektId = created.objekte[0]!.id

    const foreign = await putFeld(cookieB, objektId, 'mieteinnahmen', { kind: 'erfasst', wert: 1 })
    expect(foreign.status).toBe(404)

    const body = (await (await get(cookieB)).json()) as { objekte: unknown[] }
    expect(body.objekte).toEqual([])
    void userA
  })

  it('an unknown feld is a 400 at the boundary, never a Prisma column-miss', async () => {
    const { cookie } = await signUp('feld-400@example.com')
    const created = (await (await create(cookie)).json()) as { objekte: Array<{ id: string }> }
    const objektId = created.objekte[0]!.id

    const response = await putFeld(cookie, objektId, 'irgendwas', { kind: 'erfasst', wert: 1 })
    expect(response.status).toBe(400)
  })
})
