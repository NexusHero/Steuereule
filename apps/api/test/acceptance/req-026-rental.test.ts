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
import { describe, expect, it } from 'vitest'
import { app, baseUrl, prisma, signUp, useAcceptanceServer } from '../support/acceptance-server.js'

const ALLOWED_ORIGIN = 'https://allowed.example.com'
const TRUSTED_ORIGIN_HEADERS = { origin: ALLOWED_ORIGIN }

const TAX_YEAR = 2026

type RentalRow = { userId: string; mieteinnahmen: string | null }

describe('REQ-026 — the Vermietung vertical (Anlage V einfach), against the real server', () => {
  useAcceptanceServer({
    env: {
      GUEST_SESSION_SECRET: 'req-026-secret',
      BETTER_AUTH_SECRET: 'req-026-better-auth-secret-0123456789',
      BETTER_AUTH_URL: 'http://127.0.0.1:39996',
      CORS_ALLOWED_ORIGINS: ALLOWED_ORIGIN,
    },
    cleanup: async () => {
      await prisma.$executeRawUnsafe(`DELETE FROM "Vermietungsobjekt"`)
      await prisma.$executeRawUnsafe(`DELETE FROM "InterviewAnswer"`)
      await prisma.taxYear.deleteMany()
      await prisma.$executeRawUnsafe(`DELETE FROM "TaxDataAccessLog"`)
      await prisma.session.deleteMany()
      await prisma.account.deleteMany()
      await prisma.user.deleteMany()
    },
  })

  function get(cookie: string) {
    return fetch(`${baseUrl}/v1/steuerjahre/${TAX_YEAR}/vermietung`, { headers: { cookie } })
  }

  function create(cookie: string) {
    return fetch(`${baseUrl}/v1/steuerjahre/${TAX_YEAR}/vermietung/objekte`, { method: 'POST', headers: { cookie } })
  }

  function putField(cookie: string, propertyId: string, field: string, body: unknown) {
    return fetch(`${baseUrl}/v1/steuerjahre/${TAX_YEAR}/vermietung/objekte/${propertyId}/${field}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(body),
    })
  }

  /** Seed an interview answer through the production encryption seam (Segment 2 not yet admitted). */
  async function seedAnswer(userId: string, questionId: string, value: string): Promise<void> {
    const { ENCRYPTED_PRISMA } = await import('../../src/prisma/encrypted-prisma.provider.js')
    const encrypted = app.get<{ interviewAnswer: { create: (input: { data: unknown }) => Promise<unknown> } }>(ENCRYPTED_PRISMA)
    await encrypted.interviewAnswer.create({ data: { userId, taxYear: TAX_YEAR, questionId, value } })
  }

  it(
    'GWT — one complete object folds through the core: Mieteinnahmen + Werbungskosten + lineare AfA with § 7 Abs. 4 Herkunft',
    async () => {
      const { cookie, userId } = await signUp('gwt-vermietung@example.com')
      await seedAnswer(userId, 'vermietung-art', 'Einfach')
      const created = (await (await create(cookie)).json()) as { properties: Array<{ id: string }> }
      const propertyId = created.properties[0]!.id

      await putField(cookie, propertyId, 'mieteinnahmen', { kind: 'erfasst', value: 12000 })
      await putField(cookie, propertyId, 'anschaffungskosten', { kind: 'erfasst', value: 200000 })
      await putField(cookie, propertyId, 'baujahr', { kind: 'erfasst', value: 1990 })
      const response = await putField(cookie, propertyId, 'werbungskosten', { kind: 'erfasst', value: 1500 })

      const body = (await response.json()) as {
        classification: { kind: string }
        properties: Array<{ id: string; facts: { einnahmen: number | null; werbungskosten: number | null; depreciation: { amount: number; provenance: string } | null; openItems: number } }>
        status: { kind: string; einnahmen: number; werbungskosten: number; depreciation: number; openItems: number }
      }

      expect(body.classification).toEqual({ kind: 'einfach' })
      expect(body.properties[0]?.facts).toEqual({
        einnahmen: 12000,
        werbungskosten: 1500,
        depreciation: { amount: 4000, provenance: '§ 7 Abs. 4 Satz 1 EStG — lineare AfA 2 % bei Baujahr 1990' },
        openItems: 0,
      })
      expect(body.status).toMatchObject({ kind: 'bestimmt', einnahmen: 12000, werbungskosten: 1500, depreciation: 4000, openItems: 0 })

      // Ciphertext at rest (ADR-0008): raw SQL shows the column is NOT the plaintext figure.
      const rows = await prisma.$queryRaw<RentalRow[]>`SELECT "userId", "mieteinnahmen" FROM "Vermietungsobjekt" WHERE "userId" = ${userId}`
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
    for (const [baujahr, percent] of bands) {
      const created = (await (await create(cookie)).json()) as { properties: Array<{ id: string }> }
      const propertyId = created.properties.at(-1)!.id
      await putField(cookie, propertyId, 'mieteinnahmen', { kind: 'erfasst', value: 12000 })
      await putField(cookie, propertyId, 'anschaffungskosten', { kind: 'erfasst', value: 100000 })
      const response = await putField(cookie, propertyId, 'baujahr', { kind: 'erfasst', value: baujahr })
      const body = (await response.json()) as { properties: Array<{ facts: { depreciation: { amount: number; provenance: string } | null } }> }
      expect(body.properties.at(-1)?.facts.depreciation).toEqual({
        amount: Math.round(100000 * (percent / 100)),
        provenance: `§ 7 Abs. 4 Satz 1 EStG — lineare AfA ${percent} % bei Baujahr ${baujahr}`,
      })
    }
  })

  it('an open field stays open — never a fabricated zero (ADR-032)', async () => {
    const { cookie } = await signUp('offen@example.com')
    const created = (await (await create(cookie)).json()) as { properties: Array<{ id: string }> }
    const propertyId = created.properties[0]!.id

    const body = (await (await get(cookie)).json()) as { properties: Array<{ facts: { openItems: number } }>; status: { kind: string; openItems: number } }
    expect(body.properties[0]?.facts.openItems).toBe(3)
    expect(body.status).toMatchObject({ kind: 'offen', openItems: 3 })

    const unclear = await putField(cookie, propertyId, 'mieteinnahmen', { kind: 'unklar' })
    const unclearBody = (await unclear.json()) as { properties: Array<{ mieteinnahmen: { kind: string } }> }
    expect(unclearBody.properties[0]?.mieteinnahmen).toEqual({ kind: 'unklar' })
  })

  it('several objects sum separately — je Objekt eine Anlage V', async () => {
    const { cookie } = await signUp('mehrere@example.com')
    for (const rent of [12000, 6000]) {
      const created = (await (await create(cookie)).json()) as { properties: Array<{ id: string }> }
      const propertyId = created.properties.at(-1)!.id
      await putField(cookie, propertyId, 'mieteinnahmen', { kind: 'erfasst', value: rent })
      await putField(cookie, propertyId, 'anschaffungskosten', { kind: 'erfasst', value: 200000 })
      await putField(cookie, propertyId, 'baujahr', { kind: 'erfasst', value: 1990 })
      await putField(cookie, propertyId, 'werbungskosten', { kind: 'erfasst', value: 0 })
    }

    const body = (await (await get(cookie)).json()) as { properties: unknown[]; status: { kind: string; einnahmen: number; depreciation: number; openItems: number } }
    expect(body.properties).toHaveLength(2)
    expect(body.status).toMatchObject({ kind: 'bestimmt', einnahmen: 18000, depreciation: 8000, openItems: 0 })
  })

  it('Verkauf oder möbliert stays gated (ADR-033): the fold reads offen with the gate named', async () => {
    const { cookie, userId } = await signUp('verkauf@example.com')
    await seedAnswer(userId, 'einkuenfte', 'Vermietung')
    await seedAnswer(userId, 'vermietung-art', 'Verkauf oder möbliert')
    await create(cookie)

    const body = (await (await get(cookie)).json()) as { classification: { kind: string }; status: { kind: string; gated: string[] } }
    expect(body.classification).toEqual({ kind: 'verkauf-oder-moebliert' })
    expect(body.status).toMatchObject({ kind: 'offen', gated: ['Vermietung'] })
  })

  it('the endpoints require a real account session — a guest gets 401', async () => {
    const response = await fetch(`${baseUrl}/v1/steuerjahre/${TAX_YEAR}/vermietung`, { headers: TRUSTED_ORIGIN_HEADERS })
    expect(response.status).toBe(401)

    const createResponse = await fetch(`${baseUrl}/v1/steuerjahre/${TAX_YEAR}/vermietung/objekte`, { method: 'POST', headers: TRUSTED_ORIGIN_HEADERS })
    expect(createResponse.status).toBe(401)
  })

  it('is scoped strictly to userId — a foreign objektId is a 404, another account reads its own empty list', async () => {
    const { cookie: cookieA, userId: userA } = await signUp('scope-a@example.com')
    const { cookie: cookieB } = await signUp('scope-b@example.com')
    const created = (await (await create(cookieA)).json()) as { properties: Array<{ id: string }> }
    const propertyId = created.properties[0]!.id

    const foreign = await putField(cookieB, propertyId, 'mieteinnahmen', { kind: 'erfasst', value: 1 })
    expect(foreign.status).toBe(404)

    const body = (await (await get(cookieB)).json()) as { properties: unknown[] }
    expect(body.properties).toEqual([])
    void userA
  })

  it('an unknown feld is a 400 at the boundary, never a Prisma column-miss', async () => {
    const { cookie } = await signUp('feld-400@example.com')
    const created = (await (await create(cookie)).json()) as { properties: Array<{ id: string }> }
    const propertyId = created.properties[0]!.id

    const response = await putField(cookie, propertyId, 'irgendwas', { kind: 'erfasst', value: 1 })
    expect(response.status).toBe(400)
  })
})
