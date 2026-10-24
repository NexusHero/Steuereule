// REQ-022 — the Veranlagungsartenvergleich (M1, ticket 10.2): Einzel- vs. Zusammenveranlagung
// as a bounded comparison (ADR-0034), never a bare verdict. Real Postgres, real HTTP against the
// actual `buildApp()` boot from src/main.ts (never `.inject()`) — the acceptance tier the
// register's `Done` binds to (Musti's #249 R2 ruling).
//
// Covers: the `eindeutig` path over a real zvE route (married + income + no Lohnersatz, ADR-0034
// Regel 3), the honest `nicht-anwendbar` gate for a single user, and `unbestimmt` when the
// Progressionsvorbehalt input is absent. The core arithmetic itself is packages/core's job; this
// file proves the API gathers the facts and maps them without re-deriving the comparison.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { resetRateLimiters } from '../support/reset-rate-limiters.js'

process.env.GUEST_SESSION_SECRET = 'req-022-secret'
process.env.BETTER_AUTH_SECRET = 'req-022-better-auth-secret-0123456789'
process.env.BETTER_AUTH_URL = 'http://127.0.0.1:39994'

const ALLOWED_ORIGIN = 'https://allowed.example.com'
process.env.CORS_ALLOWED_ORIGINS = ALLOWED_ORIGIN
const TRUSTED_ORIGIN_HEADERS = { origin: ALLOWED_ORIGIN }

const STEUERJAHR = 2026

describe('REQ-022 — the Veranlagungsartenvergleich, against the real server', () => {
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
    await prisma.$executeRawUnsafe(`DELETE FROM "InterviewAnswer"`)
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

  function postAnswer(cookie: string, questionId: string, value: string) {
    return fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview/antworten`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ questionId, value }),
    })
  }

  function putLstb(cookie: string, feld: string, wert: number) {
    return fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/lstb/${feld}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ kind: 'erfasst', wert }),
    })
  }

  function getVergleich(cookie: string, query: string) {
    return fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/veranlagungsartenvergleich${query}`, { headers: { cookie } })
  }

  /** Minimal-Gate in order (creates the TaxYear row), plus optional Lohnersatz (Lebenslagen). */
  async function seed(cookie: string, withLohnersatz = false) {
    for (const [q, v] of [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', 'Nein']] as const) {
      expect((await postAnswer(cookie, q, v)).status).toBe(200)
    }
    if (withLohnersatz) {
      for (const [q, v] of [['dhf', 'Nein'], ['umzug', 'Nein'], ['abfindung', 'Nein'], ['lohnersatz', 'Nein']] as const) {
        expect((await postAnswer(cookie, q, v)).status).toBe(200)
      }
    }
  }

  it('GWT — married + income + no Lohnersatz reaches `eindeutig` over a real zvE path', async () => {
    const { cookie } = await signUp('eindeutig@example.com')
    await seed(cookie, true)
    expect((await putLstb(cookie, 'bruttoarbeitslohn', 100000)).status).toBe(200)

    const response = await getVergleich(cookie, '?verheiratet=true&zveB=0')
    expect(response.status).toBe(200)
    // zveA=100000, zveB=0 → ESt 30864 vs 21096, Soli 1251 vs 0 → einzel 32115, zusammen 21096.
    expect(await response.json()).toEqual({
      kind: 'eindeutig',
      empfehlung: 'zusammen',
      einzel: 32115,
      zusammen: 21096,
      delta: -11019,
      unschaerfe: { kind: 'bestimmt', obergrenze: 0 },
      herkunft: { zveA: 100000, zveB: 0, bestandteile: ['einkommensteuer', 'solidaritaetszuschlag'] },
    })
  })

  it('GWT — a single user gets the honest `nicht-anwendbar` gate, never a fabricated comparison', async () => {
    const { cookie } = await signUp('single@example.com')
    for (const [q, v] of [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', 'Nein']] as const) {
      expect((await postAnswer(cookie, q, v)).status).toBe(200)
    }

    const response = await getVergleich(cookie, '?verheiratet=false')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ kind: 'nicht-anwendbar', grund: 'nicht-verheiratet' })
  })

  it('GWT — without the Progressionsvorbehalt input the comparison is honest `unbestimmt`', async () => {
    const { cookie } = await signUp('unbestimmt@example.com')
    await seed(cookie, false) // lohnersatz never answered
    expect((await putLstb(cookie, 'bruttoarbeitslohn', 100000)).status).toBe(200)

    const response = await getVergleich(cookie, '?verheiratet=true&zveB=0')
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      kind: 'unbestimmt',
      unschaerfe: { kind: 'unbestimmt', grund: 'progressionsvorbehalt-nicht-eingegeben' },
    })
  })

  it('GWT — lohnersatz "Ja" without a captured amount is honest `unbestimmt`, never `eindeutig`', async () => {
    const { cookie } = await signUp('lohnersatz-ja-ohne-betrag@example.com')
    await seed(cookie, true) // dhf/umzug/abfindung/lohnersatz answered — makes `lohnersatz` reachable
    // Overwrite lohnersatz to "Ja" but never answer the `lohnersatz-betrag` follow-up: the
    // Progressionsvorbehalt is still undetermined. The service must not manufacture `betrag: 0`
    // (ADR-0032) and reach `eindeutig`.
    expect((await postAnswer(cookie, 'lohnersatz', 'Ja')).status).toBe(200)
    expect((await putLstb(cookie, 'bruttoarbeitslohn', 100000)).status).toBe(200)

    const response = await getVergleich(cookie, '?verheiratet=true&zveB=0')
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      kind: 'unbestimmt',
      unschaerfe: { kind: 'unbestimmt', grund: 'progressionsvorbehalt-nicht-eingegeben' },
    })
  })

  it('returns null (honest empty state) when no tax year is seeded yet', async () => {
    const { cookie } = await signUp('empty@example.com')
    const response = await getVergleich(cookie, '?verheiratet=true&zveB=0')
    expect(response.status).toBe(200)
    expect(await response.json()).toBeNull()
  })
})
