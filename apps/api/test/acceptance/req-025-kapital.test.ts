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
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { resetRateLimiters } from '../support/reset-rate-limiters.js'

process.env.GUEST_SESSION_SECRET = 'req-025-secret'
process.env.BETTER_AUTH_SECRET = 'req-025-better-auth-secret-0123456789'
process.env.BETTER_AUTH_URL = 'http://127.0.0.1:39995'

const ALLOWED_ORIGIN = 'https://allowed.example.com'
process.env.CORS_ALLOWED_ORIGINS = ALLOWED_ORIGIN
const TRUSTED_ORIGIN_HEADERS = { origin: ALLOWED_ORIGIN }

const STEUERJAHR = 2026

type KapitalRow = { userId: string; kapitalertraege: string | null }

describe('REQ-025 — the Kapital vertical (Anlage KAP), against the real server', () => {
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
    await prisma.$executeRawUnsafe(`DELETE FROM "Kapital"`)
    await prisma.$executeRawUnsafe(`DELETE FROM "Lstb"`)
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
    return fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/kapital`, { headers: { cookie } })
  }

  function putFeld(cookie: string, body: unknown) {
    return fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/kapital/kapitalertraege`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(body),
    })
  }

  function getGuenstigerpruefung(cookie: string) {
    return fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/kapital/guenstigerpruefung`, { headers: { cookie } })
  }

  function postAnswer(cookie: string, questionId: string, value: string) {
    return fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview/antworten`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ questionId, value }),
    })
  }

  function putLstb(cookie: string, wert: number) {
    return fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/lstb/bruttoarbeitslohn`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ kind: 'erfasst', wert }),
    })
  }

  /** Seed an interview answer through the production encryption seam (Segment 2 not yet admitted). */
  async function seedAnswer(userId: string, questionId: string, wert: string): Promise<void> {
    const { ENCRYPTED_PRISMA } = await import('../../src/prisma/encrypted-prisma.provider.js')
    const encrypted = app.get<{ interviewAnswer: { create: (input: { data: unknown }) => Promise<unknown> } }>(ENCRYPTED_PRISMA)
    await encrypted.interviewAnswer.create({ data: { userId, steuerjahr: STEUERJAHR, questionId, value: wert } })
  }

  it(
    'GWT — a German broker\'s Kapitalerträge fold through the core with Herkunft eingabe',
    async () => {
      const { cookie, userId } = await signUp('gwt-kapital@example.com')
      await seedAnswer(userId, 'kap-depot', 'Deutscher Broker')
      const response = await putFeld(cookie, { kind: 'erfasst', wert: 2500 })

      const body = (await response.json()) as {
        kapitalertraege: { kind: string; wert?: number }
        depot: { kind: string }
        posten: Array<{ id: string; betrag: number; herkunft: string }>
        stand: { kind: string; einnahmen: number; vorsorgeaufwand: number; anrechnung: number }
      }

      expect(body.kapitalertraege).toEqual({ kind: 'erfasst', wert: 2500 })
      expect(body.depot).toEqual({ kind: 'deutscher-broker' })
      expect(body.posten).toEqual([{ id: 'kapital', betrag: 2500, herkunft: 'eingabe' }])
      expect(body.stand).toEqual({ kind: 'bestimmt', einnahmen: 2500, vorsorgeaufwand: 0, anrechnung: 0 })

      // Ciphertext at rest (ADR-0008): raw SQL shows the column is NOT the plaintext figure.
      const rows = await prisma.$queryRaw<KapitalRow[]>`SELECT "userId", "kapitalertraege" FROM "Kapital" WHERE "userId" = ${userId}`
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

    const body = (await (await get(cookie)).json()) as { kapitalertraege: { kind: string }; posten: unknown[]; stand: { kind: string; offenePosten: number } }
    expect(body.kapitalertraege).toEqual({ kind: 'offen' })
    expect(body.posten).toEqual([])
    expect(body.stand).toMatchObject({ kind: 'offen', offenePosten: 1 })

    const unklar = await putFeld(cookie, { kind: 'unklar' })
    const unklarBody = (await unklar.json()) as { kapitalertraege: { kind: string }; stand: { kind: string; offenePosten: number } }
    expect(unklarBody.kapitalertraege).toEqual({ kind: 'unklar' })
    expect(unklarBody.stand).toMatchObject({ kind: 'offen', offenePosten: 1 })
  })

  it('a foreign broker withheld no Abgeltungsteuer — KAP-Pflicht, never a guessed comparison', async () => {
    const { cookie, userId } = await signUp('ausland@example.com')
    for (const [q, v] of [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', 'Nein']] as const) {
      expect((await postAnswer(cookie, q, v)).status).toBe(200)
    }
    await seedAnswer(userId, 'kap-depot', 'Ausländischer Broker')
    await putFeld(cookie, { kind: 'erfasst', wert: 20000 })

    const body = (await (await get(cookie)).json()) as { depot: { kind: string } }
    expect(body.depot).toEqual({ kind: 'auslaendischer-broker' })

    const gp = await getGuenstigerpruefung(cookie)
    expect(await gp.json()).toEqual({ kind: 'nicht-anwendbar', grund: 'keine-abgeltung-einbehalten' })
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
    const response = await putFeld(cookie, { kind: 'erfasst', wert: 20000 })

    const body = (await response.json()) as { depot: { kind: string }; stand: { kind: string; gegated: string[] } }
    expect(body.depot).toEqual({ kind: 'krypto' })
    expect(body.stand).toMatchObject({ kind: 'offen', gegated: ['Kapital'] })

    const gp = await getGuenstigerpruefung(cookie)
    expect(await gp.json()).toEqual({ kind: 'nicht-anwendbar', grund: 'krypto-gegated' })
  })

  it('GWT — the § 32d Abs. 6 Günstigerprüfung over a real zvE path: bounded, never a bare verdict', async () => {
    const { cookie, userId } = await signUp('gp-eindeutig@example.com')
    for (const [q, v] of [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', 'Nein']] as const) {
      expect((await postAnswer(cookie, q, v)).status).toBe(200)
    }
    // lohnersatz answered → Progressionsvorbehalt bound (0), so eindeutig is reachable.
    for (const [q, v] of [['dhf', 'Nein'], ['umzug', 'Nein'], ['abfindung', 'Nein'], ['lohnersatz', 'Nein']] as const) {
      expect((await postAnswer(cookie, q, v)).status).toBe(200)
    }
    await seedAnswer(userId, 'kap-depot', 'Deutscher Broker')
    expect((await putFeld(cookie, { kind: 'erfasst', wert: 20000 })).status).toBe(200)
    expect((await putLstb(cookie, 60000)).status).toBe(200)

    const gp = await getGuenstigerpruefung(cookie)
    expect(await gp.json()).toEqual({
      kind: 'eindeutig',
      empfehlung: 'abgeltung',
      abgeltung: 4750,
      persoenlich: 8482,
      delta: 3732,
      unschaerfe: { kind: 'bestimmt', obergrenze: 0 },
      herkunft: {
        kapitalertraege: 20000,
        uebrigesZvE: 60000,
        sparerpauschbetrag: 1000,
        veranlagung: 'einzel',
        bestandteile: ['einkommensteuer', 'solidaritaetszuschlag'],
      },
    })
  })

  it('without the Progressionsvorbehalt input the Günstigerprüfung is honest unbestimmt', async () => {
    const { cookie, userId } = await signUp('gp-unbestimmt@example.com')
    for (const [q, v] of [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', 'Nein']] as const) {
      expect((await postAnswer(cookie, q, v)).status).toBe(200)
    }
    await seedAnswer(userId, 'kap-depot', 'Deutscher Broker')
    await putFeld(cookie, { kind: 'erfasst', wert: 20000 })

    const gp = await getGuenstigerpruefung(cookie)
    expect(await gp.json()).toMatchObject({
      kind: 'unbestimmt',
      unschaerfe: { kind: 'unbestimmt', grund: 'progressionsvorbehalt-nicht-eingegeben' },
    })
  })

  it('the endpoints require a real account session — a guest gets 401', async () => {
    const response = await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/kapital`, { headers: TRUSTED_ORIGIN_HEADERS })
    expect(response.status).toBe(401)

    const gp = await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/kapital/guenstigerpruefung`, { headers: TRUSTED_ORIGIN_HEADERS })
    expect(gp.status).toBe(401)
  })

  it('is scoped strictly to userId — another account reads its own empty mask', async () => {
    const { cookie: cookieA, userId: userA } = await signUp('scope-a@example.com')
    const { cookie: cookieB } = await signUp('scope-b@example.com')
    await seedAnswer(userA, 'kap-depot', 'Deutscher Broker')
    await putFeld(cookieA, { kind: 'erfasst', wert: 2500 })

    const body = (await (await get(cookieB)).json()) as { kapitalertraege: { kind: string }; posten: unknown[] }
    expect(body.kapitalertraege).toEqual({ kind: 'offen' })
    expect(body.posten).toEqual([])
  })

  it('an unknown feld is a 400 at the boundary, never a Prisma column-miss', async () => {
    const { cookie } = await signUp('feld-400@example.com')
    const response = await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/kapital/irgendwas`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ kind: 'erfasst', wert: 1 }),
    })
    expect(response.status).toBe(400)
  })
})
