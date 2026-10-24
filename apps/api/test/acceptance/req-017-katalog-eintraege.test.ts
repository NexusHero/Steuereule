// REQ-017 — the on-demand interview catalogue (ADR-016/031/035, ticket 08): the 5
// Lebenslagen and the Sonderausgaben-Katalog arrive as MORE catalogue entries over the SAME
// engine that already runs the Minimal-Gate (#321 R1/R2). Real Postgres, real HTTP against
// the actual `buildApp()` boot — the acceptance tier the register's `Done` binds to.
//
// Proves the server-side admission is one engine, not a second code path: a Lebenslagen or
// Sonderausgaben write is admitted by `entryForStep` deriving the owning entry from the bare
// questionId (interview.ts D3), and every answer is still validated against the same
// `QUESTIONS` registry (`isValidAnswer`). The core graph's own correctness is
// packages/core/src/interview.test.ts's job; this file proves the API admits/rejects by the
// same rules over the wider entry domain.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { resetRateLimiters } from '../support/reset-rate-limiters.js'

process.env.GUEST_SESSION_SECRET = 'req-017-secret'
process.env.BETTER_AUTH_SECRET = 'req-017-better-auth-secret-0123456789'
process.env.BETTER_AUTH_URL = 'http://127.0.0.1:39993'

const ALLOWED_ORIGIN = 'https://allowed.example.com'
process.env.CORS_ALLOWED_ORIGINS = ALLOWED_ORIGIN
const TRUSTED_ORIGIN_HEADERS = { origin: ALLOWED_ORIGIN }

const STEUERJAHR = 2026

describe('REQ-017 — the on-demand catalogue entries (Lebenslagen + Sonderausgaben), real server', () => {
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

  function getEntry(cookie: string, eintrag: string) {
    return fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview?eintrag=${eintrag}`, { headers: { cookie } })
  }

  function postAnswer(cookie: string, questionId: string, value: string) {
    return fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview/antworten`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ questionId, value }),
    })
  }

  it('GET with eintrag=lebenslagen opens at the first Lebenslage question, scoped to that entry', async () => {
    const { cookie } = await signUp('lebenslagen@example.com')

    const response = await getEntry(cookie, 'lebenslagen')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      answers: {},
      nextStep: { kind: 'question', id: 'dhf' },
      openItems: 5,
    })
  })

  it('GET with eintrag=sonderausgaben opens at the first Sonderausgabe question', async () => {
    const { cookie } = await signUp('sonderausgaben@example.com')

    const response = await getEntry(cookie, 'sonderausgaben')
    expect(await response.json()).toEqual({
      answers: {},
      nextStep: { kind: 'question', id: 'spenden' },
      openItems: 3,
    })
  })

  it('GET with an unknown eintrag id is a 400', async () => {
    const { cookie } = await signUp('unknown-entry@example.com')

    const response = await getEntry(cookie, 'gewerbe-eintrag')
    expect(response.status).toBe(400)
  })

  it('a Lebenslage answer is admitted by entryForStep, and its follow-up becomes the next step', async () => {
    const { cookie } = await signUp('dhf-ja@example.com')

    const answer = await postAnswer(cookie, 'dhf', 'Ja')
    expect(answer.status).toBe(200)
    expect(await answer.json()).toMatchObject({ nextStep: { kind: 'question', id: 'dhf-miete' } })

    const followUp = await postAnswer(cookie, 'dhf-miete', '800')
    expect(followUp.status).toBe(200)
  })

  it('a Sonderausgabe answer is admitted the same way (one engine, not a second path)', async () => {
    const { cookie } = await signUp('spenden@example.com')

    const answer = await postAnswer(cookie, 'spenden', 'Ja')
    expect(answer.status).toBe(200)
    expect(await answer.json()).toMatchObject({ nextStep: { kind: 'question', id: 'spenden-betrag' } })
  })

  it('a follow-up is unreachable (409) until its parent is answered with the opening value', async () => {
    const { cookie } = await signUp('unreachable-followup@example.com')

    const response = await postAnswer(cookie, 'dhf-miete', '800')
    expect(response.status).toBe(409)
  })

  it('a closed branch refuses its follow-up: dhf "Nein" makes dhf-miete unreachable (409)', async () => {
    const { cookie } = await signUp('dhf-nein@example.com')

    await postAnswer(cookie, 'dhf', 'Nein')
    const response = await postAnswer(cookie, 'dhf-miete', '800')
    expect(response.status).toBe(409)
  })

  it('an invalid value for a Lebenslage question is a 400', async () => {
    const { cookie } = await signUp('invalid-value@example.com')

    const response = await postAnswer(cookie, 'dhf', 'Vielleicht')
    expect(response.status).toBe(400)
  })

  it('the Minimal-Gate stays independent: a Lebenslagen write neither opens nor closes the gate path', async () => {
    const { cookie } = await signUp('independent@example.com')

    await postAnswer(cookie, 'dhf', 'Ja')

    // `job` is still the Minimal-Gate's first step, reachable on its own entry.
    const job = await postAnswer(cookie, 'job', 'Angestellt')
    expect(job.status).toBe(200)
    expect(await job.json()).toMatchObject({ nextStep: { kind: 'question', id: 'ausland' } })
  })
})
