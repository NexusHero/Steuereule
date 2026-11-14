// Escalation case: both spouses are Grenzgänger. The user records Person B's Swiss certificate,
// N-Gre facts, exchange rate and Grenzgänger questions through the same routes as their own, with
// `?person=B` (ADR-0054). Real Postgres, real HTTP against `buildApp()`.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

process.env.GUEST_SESSION_SECRET = 'person-b-ch-secret'
process.env.BETTER_AUTH_SECRET = 'person-b-ch-better-auth-secret-0123456789'
process.env.BETTER_AUTH_URL = 'http://127.0.0.1:39993'
const ALLOWED_ORIGIN = 'https://allowed.example.com'
process.env.CORS_ALLOWED_ORIGINS = ALLOWED_ORIGIN

const YEAR = 2025

describe('Person B’s Swiss figures, recorded by the user', () => {
  let app: NestFastifyApplication
  let baseUrl: string
  let prisma: PrismaClient
  let cookie: string

  beforeAll(async () => {
    const { buildApp } = await import('../../src/main.js')
    app = await buildApp()
    await app.listen(0, '127.0.0.1')
    baseUrl = await app.getUrl()
    const { PrismaService } = await import('../../src/prisma/prisma.service.js')
    prisma = app.get(PrismaService)
    const email = `person-b-ch-${Date.now()}@example.com`
    const res = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ALLOWED_ORIGIN },
      body: JSON.stringify({ email, password: 'a-fine-strong-password-1', name: 'Test User' }),
    })
    expect(res.status).toBe(200)
    cookie = res.headers.get('set-cookie')!.split(';')[0]!
    await put('/kopplung', { filingType: 'zusammen' })
    await put('/kopplung/person-b', { firstName: 'Nora', lastName: 'Beispiel' })
  })

  afterAll(async () => {
    await prisma.$disconnect()
    await app.close()
  })

  async function send(method: string, path: string, body?: unknown) {
    return fetch(`${baseUrl}/v1/steuerjahre/${YEAR}${path}`, {
      method,
      headers: { cookie, origin: ALLOWED_ORIGIN, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  }
  async function put(path: string, body: unknown) {
    const res = await send('PUT', path, body)
    expect(res.status, `${path}: ${await res.clone().text()}`).toBe(200)
    return res.json() as Promise<Record<string, unknown>>
  }

  it('writes B’s certificate, N-Gre facts, rate and status into B’s record, the user’s stays empty', async () => {
    await put('/ch-lohnausweis/bruttolohn-total?person=B', { kind: 'erfasst', value: 31_200 })
    await put('/ch-lohnausweis/n-gre?person=B', { arbeitgeberName: 'Klinik Beispiel AG', arbeitgeberStrasse: 'Rheinweg 2', arbeitgeberPlzOrt: '4058 Basel' })
    await put('/ch-lohnausweis/wechselkurs?person=B', { month: '2025', rate: 1.065, mode: 'jahresdurchschnitt' })
    const b = await put('/ch-lohnausweis/grenzgaenger?person=B', { residence: 'Deutschland', daysWithoutReturn: 0 })

    expect(b.status).toBe('echter-grenzgaenger')
    expect(b.nGre).toMatchObject({ arbeitgeberName: 'Klinik Beispiel AG', arbeitgeberPlzOrt: '4058 Basel' })
    expect((b.fields as Array<{ id: string; value?: number }>).find((f) => f.id === 'bruttolohn-total')?.value).toBe(31_200)

    const own = (await (await send('GET', '/ch-lohnausweis')).json()) as { fields: Array<{ kind: string }>; status: unknown }
    expect(own.fields.every((f) => f.kind === 'offen')).toBe(true)
    expect(own.status).toBeNull()
  })

  it('records B’s pension through the pension routes with ?person=B (ADR-0088)', async () => {
    await put('/rente/art?person=B', { kind: 'GesetzlicheRente' })
    await put('/rente/jahresbetrag?person=B', { kind: 'erfasst', value: 18_000 })
    const b = await put('/rente/rentenbeginnJahr?person=B', { kind: 'erfasst', value: 2020 })
    expect(b).toMatchObject({ kind: 'GesetzlicheRente', jahresbetrag: { kind: 'erfasst', value: 18_000 } })
    const own = (await (await send('GET', '/rente')).json()) as { kind: string | null }
    expect(own.kind).toBeNull()
  })

  it('answers B’s own Sonderausgaben in B’s record, and keeps the joint catalogues the user’s (ADR-0088)', async () => {
    for (const [questionId, value] of [['spenden', 'Nein'], ['kv-pv', 'Nein'], ['riester', 'Ja'], ['riester-betrag', '1200']]) {
      const res = await send('POST', '/interview/antworten?person=B', { questionId, value })
      expect(res.status, await res.clone().text()).toBe(200)
    }
    const b = (await (await send('GET', '/interview?eintrag=sonderausgaben&person=B')).json()) as { answers: Record<string, string> }
    expect(b.answers).toMatchObject({ riester: 'Ja', 'riester-betrag': '1200' })
    const own = (await (await send('GET', '/interview?eintrag=sonderausgaben')).json()) as { answers: Record<string, string> }
    expect(own.answers.riester).toBeUndefined()
    expect((await send('GET', '/interview?eintrag=gesundheit&person=B')).status).toBe(400)
    expect((await send('POST', '/interview/antworten?person=B', { questionId: 'gesundheit-gate', value: 'Ja' })).status).toBe(409)
  })

  it('keeps the user’s own Grenzgänger questions in the interview', async () => {
    const res = await send('PUT', '/ch-lohnausweis/grenzgaenger', { residence: 'Deutschland', daysWithoutReturn: 0 })
    expect(res.status).toBe(400)
  })
})
