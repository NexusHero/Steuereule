// REQ-025 — the Kapital vertical (ticket 10.5, product ADR-032, Anlage KAP). Real Postgres, real
// HTTP against the actual `buildApp()` boot (never `.inject()`) — the acceptance tier the
// register's `Done` binds to (Musti's #249 R2 ruling).
//
// Covers the ticket's core: a signed-in account holder transcribes their Jahressteuerbescheinigung
// (Kapitalerträge) and the amount folds through the deterministic core with Herkunft; the depot
// kind comes from the stored interview answer `kap-depot` (a foreign broker withheld nothing —
// KAP-Pflicht, never a guessed Abgeltung; Krypto is gated, ADR-032 §2); the § 32d Abs. 6
// Günstigerprüfung is a bounded comparison (ADR-0034-Muster), never a bare verdict. An empty
// required field stays open, never a fabricated zero; and the figure is ciphertext at rest
// (ADR-0008). The `kap-depot` answer is seeded through the production encryption seam
// (ENCRYPTED_PRISMA) because Segment 2 is not yet admitted server-side (interview.service.ts
// ADMITTED_ENTRY_IDS) — the same rows the service reads in production.
import { describe, expect, it } from 'vitest'
import { app, baseUrl, prisma, signUp, useAcceptanceServer } from '../support/acceptance-server.js'

const ALLOWED_ORIGIN = 'https://allowed.example.com'
const TRUSTED_ORIGIN_HEADERS = { origin: ALLOWED_ORIGIN }

const TAX_YEAR = 2026

type CapitalRow = { userId: string; kapitalertraege: string | null }

describe('REQ-025 — the Kapital vertical (Anlage KAP), against the real server', () => {
  useAcceptanceServer({
    env: {
      GUEST_SESSION_SECRET: 'req-025-secret',
      BETTER_AUTH_SECRET: 'req-025-better-auth-secret-0123456789',
      BETTER_AUTH_URL: 'http://127.0.0.1:39995',
      CORS_ALLOWED_ORIGINS: ALLOWED_ORIGIN,
    },
    cleanup: async () => {
      await prisma.$executeRawUnsafe(`DELETE FROM "Kapital"`)
      await prisma.$executeRawUnsafe(`DELETE FROM "Lstb"`)
      await prisma.$executeRawUnsafe(`DELETE FROM "InterviewAnswer"`)
      await prisma.taxYear.deleteMany()
      await prisma.$executeRawUnsafe(`DELETE FROM "TaxDataAccessLog"`)
      await prisma.session.deleteMany()
      await prisma.account.deleteMany()
      await prisma.user.deleteMany()
    },
  })

  function get(cookie: string) {
    return fetch(`${baseUrl}/v1/steuerjahre/${TAX_YEAR}/kapital`, { headers: { cookie } })
  }

  function putField(cookie: string, body: unknown) {
    return fetch(`${baseUrl}/v1/steuerjahre/${TAX_YEAR}/kapital/kapitalertraege`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(body),
    })
  }

  function getMostFavourableCheck(cookie: string) {
    return fetch(`${baseUrl}/v1/steuerjahre/${TAX_YEAR}/kapital/guenstigerpruefung`, { headers: { cookie } })
  }

  function postAnswer(cookie: string, questionId: string, value: string) {
    return fetch(`${baseUrl}/v1/steuerjahre/${TAX_YEAR}/interview/antworten`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ questionId, value }),
    })
  }

  function putLstb(cookie: string, value: number, field: 'bruttoarbeitslohn' | 'lohnsteuer' | 'sozialversicherung' = 'bruttoarbeitslohn') {
    return fetch(`${baseUrl}/v1/steuerjahre/${TAX_YEAR}/lstb/${field}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ kind: 'erfasst', value }),
    })
  }

  /** Seed an interview answer through the production encryption seam (Segment 2 not yet admitted). */
  async function seedAnswer(userId: string, questionId: string, value: string): Promise<void> {
    const { ENCRYPTED_PRISMA } = await import('../../src/prisma/encrypted-prisma.provider.js')
    const encrypted = app.get<{ interviewAnswer: { create: (input: { data: unknown }) => Promise<unknown> } }>(ENCRYPTED_PRISMA)
    await encrypted.interviewAnswer.create({ data: { userId, taxYear: TAX_YEAR, questionId, value } })
  }

  it(
    'GWT — a German broker\'s Kapitalerträge fold through the core with Herkunft eingabe',
    async () => {
      const { cookie, userId } = await signUp('gwt-kapital@example.com')
      await seedAnswer(userId, 'kap-depot', 'Deutscher Broker')
      const response = await putField(cookie, { kind: 'erfasst', value: 2500 })

      const body = (await response.json()) as {
        kapitalertraege: { kind: string; value?: number }
        depot: { kind: string }
        items: Array<{ id: string; amount: number; provenance: string }>
        status: { kind: string; einnahmen: number; vorsorgeaufwand: number; anrechnung: number }
      }

      expect(body.kapitalertraege).toEqual({ kind: 'erfasst', value: 2500 })
      expect(body.depot).toEqual({ kind: 'deutscher-broker' })
      expect(body.items).toEqual([{ id: 'kapital', amount: 2500, provenance: 'eingabe' }])
      expect(body.status).toEqual({ kind: 'bestimmt', einnahmen: 2500, vorsorgeaufwand: 0, anrechnung: 0 })

      // Ciphertext at rest (ADR-0008): raw SQL shows the column is NOT the plaintext figure.
      const rows = await prisma.$queryRaw<CapitalRow[]>`SELECT "userId", "kapitalertraege" FROM "Kapital" WHERE "userId" = ${userId}`
      expect(rows).toHaveLength(1)
      expect(rows[0]?.kapitalertraege).not.toBe('2500')
      expect(rows[0]?.kapitalertraege).toBeTypeOf('string')

      // The WRITE audit entry is appended atomically with the upsert (REQ-004).
      const audit = await prisma.$queryRaw<Array<{ action: string; resource: string }>>`SELECT "action", "resource" FROM "TaxDataAccessLog" WHERE "userId" = ${userId}`
      expect(audit).toEqual([{ action: 'WRITE', resource: 'kapital' }])
    },
  )

  it('an open field stays open — never a fabricated zero (ADR-032)', async () => {
    const { cookie } = await signUp('offen@example.com')

    const body = (await (await get(cookie)).json()) as { kapitalertraege: { kind: string }; items: unknown[]; status: { kind: string; openItems: number } }
    expect(body.kapitalertraege).toEqual({ kind: 'offen' })
    expect(body.items).toEqual([])
    expect(body.status).toMatchObject({ kind: 'offen', openItems: 1 })

    const unclear = await putField(cookie, { kind: 'unklar' })
    const unclearBody = (await unclear.json()) as { kapitalertraege: { kind: string }; status: { kind: string; openItems: number } }
    expect(unclearBody.kapitalertraege).toEqual({ kind: 'unklar' })
    expect(unclearBody.status).toMatchObject({ kind: 'offen', openItems: 1 })
  })

  it('a foreign broker withheld no Abgeltungsteuer — KAP-Pflicht, never a guessed comparison', async () => {
    const { cookie, userId } = await signUp('ausland@example.com')
    for (const [q, v] of [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', 'Nein']] as const) {
      expect((await postAnswer(cookie, q, v)).status).toBe(200)
    }
    await seedAnswer(userId, 'kap-depot', 'Ausländischer Broker')
    await putField(cookie, { kind: 'erfasst', value: 20000 })

    const body = (await (await get(cookie)).json()) as { depot: { kind: string } }
    expect(body.depot).toEqual({ kind: 'auslaendischer-broker' })

    const gp = await getMostFavourableCheck(cookie)
    expect(await gp.json()).toEqual({ kind: 'nicht-anwendbar', reason: 'keine-abgeltung-einbehalten' })
  })

  it('Krypto is gated (ADR-032 §2): the fold reads offen with the gate named, the Günstigerprüfung never applies', async () => {
    const { cookie, userId } = await signUp('krypto@example.com')
    for (const [q, v] of [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', 'Nein']] as const) {
      expect((await postAnswer(cookie, q, v)).status).toBe(200)
    }
    // The declared Einkunftsart (Segment-2 answer, not yet admitted server-side) — seeded through
    // the production encryption seam like kap-depot.
    await seedAnswer(userId, 'kap-depot', 'Krypto')
    await seedAnswer(userId, 'einkuenfte', 'Kapitalerträge')
    const response = await putField(cookie, { kind: 'erfasst', value: 20000 })

    const body = (await response.json()) as { depot: { kind: string }; status: { kind: string; gated: string[] } }
    expect(body.depot).toEqual({ kind: 'krypto' })
    expect(body.status).toMatchObject({ kind: 'offen', gated: ['Kapital'] })

    const gp = await getMostFavourableCheck(cookie)
    expect(await gp.json()).toEqual({ kind: 'nicht-anwendbar', reason: 'krypto-gegated' })
  })

  it('GWT — the § 32d Abs. 6 Günstigerprüfung on the Cockpit estimate: its taxable income, its tariff', async () => {
    const { cookie, userId } = await signUp('gp-eindeutig@example.com')
    for (const [q, v] of [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', 'Nein']] as const) {
      expect((await postAnswer(cookie, q, v)).status).toBe(200)
    }
    for (const [q, v] of [['dhf', 'Nein'], ['umzug', 'Nein'], ['abfindung', 'Nein'], ['lohnersatz', 'Nein']] as const) {
      expect((await postAnswer(cookie, q, v)).status).toBe(200)
    }
    await seedAnswer(userId, 'kap-depot', 'Deutscher Broker')
    expect((await putField(cookie, { kind: 'erfasst', value: 20000 })).status).toBe(200)
    expect((await putLstb(cookie, 60000)).status).toBe(200)
    expect((await putLstb(cookie, 9500, 'lohnsteuer')).status).toBe(200)
    expect((await putLstb(cookie, 12000, 'sozialversicherung')).status).toBe(200)

    const estimate = (await (await fetch(`${baseUrl}/v1/steuerjahre/${TAX_YEAR}/steuerschaetzung`, { headers: { cookie } })).json()) as { taxableIncome: { from: number; to: number } }
    const gp = await getMostFavourableCheck(cookie)
    expect(await gp.json()).toMatchObject({
      kind: 'eindeutig',
      recommendation: 'abgeltung',
      // 19.000 € × 25 % plus 5,5 % Soli.
      flatRateTax: 5011.25,
      estimateTreatment: 'quelle',
      provenance: {
        kapitalertraege: 20000,
        remainingZvE: estimate.taxableIncome.to,
        remainingZvEFrom: estimate.taxableIncome.from,
        saversAllowance: 1000,
        assessmentType: 'einzel',
        components: ['einkommensteuer', 'solidaritaetszuschlag'],
      },
    })
  })

  it('without a complete estimate the Günstigerprüfung names what the estimate lacks', async () => {
    const { cookie, userId } = await signUp('gp-unbestimmt@example.com')
    for (const [q, v] of [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', 'Nein']] as const) {
      expect((await postAnswer(cookie, q, v)).status).toBe(200)
    }
    await seedAnswer(userId, 'kap-depot', 'Deutscher Broker')
    await putField(cookie, { kind: 'erfasst', value: 20000 })

    const gp = (await (await getMostFavourableCheck(cookie)).json()) as { kind: string; reason: string; missing: string[] }
    expect(gp).toMatchObject({ kind: 'nicht-anwendbar', reason: 'schaetzung-offen' })
    expect(gp.missing).toContain('bruttoarbeitslohn')
  })

  it('the endpoints require a real account session — a guest gets 401', async () => {
    const response = await fetch(`${baseUrl}/v1/steuerjahre/${TAX_YEAR}/kapital`, { headers: TRUSTED_ORIGIN_HEADERS })
    expect(response.status).toBe(401)

    const gp = await fetch(`${baseUrl}/v1/steuerjahre/${TAX_YEAR}/kapital/guenstigerpruefung`, { headers: TRUSTED_ORIGIN_HEADERS })
    expect(gp.status).toBe(401)
  })

  it('is scoped strictly to userId — another account reads its own empty mask', async () => {
    const { cookie: cookieA, userId: userA } = await signUp('scope-a@example.com')
    const { cookie: cookieB } = await signUp('scope-b@example.com')
    await seedAnswer(userA, 'kap-depot', 'Deutscher Broker')
    await putField(cookieA, { kind: 'erfasst', value: 2500 })

    const body = (await (await get(cookieB)).json()) as { kapitalertraege: { kind: string }; items: unknown[] }
    expect(body.kapitalertraege).toEqual({ kind: 'offen' })
    expect(body.items).toEqual([])
  })

  it('an unknown feld is a 400 at the boundary, never a Prisma column-miss', async () => {
    const { cookie } = await signUp('feld-400@example.com')
    const response = await fetch(`${baseUrl}/v1/steuerjahre/${TAX_YEAR}/kapital/irgendwas`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ kind: 'erfasst', value: 1 }),
    })
    expect(response.status).toBe(400)
  })
})
