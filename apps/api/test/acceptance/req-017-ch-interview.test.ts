// REQ-017 — the Grenzgänger-CH interview entry (segment-ch, ADR-013/036). Real Postgres,
// real HTTP against the actual `buildApp()` boot (never `.inject()`) — the acceptance tier
// the register's `Done` binds to, same bar as REQ-015 (#318).
//
// This is the CH vertical's proof that the ONE interview engine in packages/core admits a
// second case world: `ch-wohnsitz` + `ch-nichtrueckkehrtage` are server-validated through
// the exact same `entryForStep`/`isReachableFor`/`isValidAnswer` admission the Minimal-Gate
// uses — no second code path, no client-trusted gate (ADR-0033 D3, ADR-0021).
//
// The Grenzgänger-Status itself (the 45-Tage rule, ADR-013) is a DERIVED fact computed in
// packages/core (`grenzgaengerStatus`) — its own tests live in packages/core, not here; this
// file proves the answers that feed it are persisted, server-validated, and ciphertext at rest.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { resetRateLimiters } from '../support/reset-rate-limiters.js'

process.env.GUEST_SESSION_SECRET = 'req-017-secret'
process.env.BETTER_AUTH_SECRET = 'req-017-better-auth-secret-0123456789'
process.env.BETTER_AUTH_URL = 'http://127.0.0.1:39992'

const ALLOWED_ORIGIN = 'https://allowed.example.com'
process.env.CORS_ALLOWED_ORIGINS = ALLOWED_ORIGIN
const TRUSTED_ORIGIN_HEADERS = { origin: ALLOWED_ORIGIN }

const STEUERJAHR = 2026

type InterviewAnswerRow = { userId: string; steuerjahr: number; questionId: string; value: string }

describe('REQ-017 — the Grenzgänger-CH interview entry, against the real server', () => {
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

  async function interviewRows(userId: string): Promise<InterviewAnswerRow[]> {
    return prisma.$queryRaw<InterviewAnswerRow[]>`
      SELECT "userId", "steuerjahr", "questionId", "value" FROM "InterviewAnswer" WHERE "userId" = ${userId}
    `
  }

  it('GWT — the two CH questions answer in order, persist server-side, and each response names the CH next step', async () => {
    const { cookie, userId } = await signUp('ch-gwt@example.com')

    const wohnsitz = await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview/antworten`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ questionId: 'ch-wohnsitz', value: 'Deutschland' }),
    })
    expect(wohnsitz.status).toBe(200)
    expect(await wohnsitz.json()).toEqual({ nextStep: { kind: 'question', id: 'ch-nichtrueckkehrtage' }, openItems: 3 })

    const tage = await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview/antworten`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ questionId: 'ch-nichtrueckkehrtage', value: '20' }),
    })
    expect(tage.status).toBe(200)
    expect(await tage.json()).toEqual({ nextStep: { kind: 'done' }, openItems: 3 })

    // Raw SQL proves the two rows exist; the GET proves the values are decrypted back to what
    // the client sent (raw SQL returns ciphertext — asserted as such in the ciphertext test below).
    const rows = await interviewRows(userId)
    expect(rows.map((r) => r.questionId).sort()).toEqual(['ch-nichtrueckkehrtage', 'ch-wohnsitz'])

    const state = await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview`, { headers: { cookie } })
    expect(((await state.json()) as { answers: Record<string, string> }).answers).toEqual({ 'ch-wohnsitz': 'Deutschland', 'ch-nichtrueckkehrtage': '20' })
  })

  it('server-side order: ch-nichtrueckkehrtage is rejected (409) before ch-wohnsitz is answered, and creates no row', async () => {
    const { cookie, userId } = await signUp('ch-order@example.com')

    const response = await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview/antworten`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ questionId: 'ch-nichtrueckkehrtage', value: '20' }),
    })
    expect(response.status).toBe(409)
    await expect(interviewRows(userId)).resolves.toEqual([])
  })

  it('server-side value validation: an invalid ch-wohnsitz value is rejected (400), an out-of-range day count too', async () => {
    const { cookie, userId } = await signUp('ch-invalid@example.com')

    const badWohnsitz = await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview/antworten`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ questionId: 'ch-wohnsitz', value: 'Frankreich' }),
    })
    expect(badWohnsitz.status).toBe(400)

    await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview/antworten`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ questionId: 'ch-wohnsitz', value: 'Schweiz' }),
    })
    const badTage = await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview/antworten`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ questionId: 'ch-nichtrueckkehrtage', value: '366' }),
    })
    expect(badTage.status).toBe(400)

    const rows = await interviewRows(userId)
    expect(rows.map((r) => r.questionId)).toEqual(['ch-wohnsitz'])

    const state = await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview`, { headers: { cookie } })
    expect(((await state.json()) as { answers: Record<string, string> }).answers).toEqual({ 'ch-wohnsitz': 'Schweiz' })
  })

  it('a guest (no account session) is rejected with 401 on the CH write, same as the Minimal-Gate', async () => {
    const response = await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview/antworten`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ questionId: 'ch-wohnsitz', value: 'Deutschland' }),
    })
    expect(response.status).toBe(401)

    const rows = await prisma.$queryRaw<InterviewAnswerRow[]>`SELECT "userId", "steuerjahr", "questionId", "value" FROM "InterviewAnswer"`
    expect(rows).toEqual([])
  })

  it('cross-user isolation: user B can neither read nor write user A’s CH answers', async () => {
    const userA = await signUp('ch-a@example.com')
    const userB = await signUp('ch-b@example.com')

    await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview/antworten`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: userA.cookie },
      body: JSON.stringify({ questionId: 'ch-wohnsitz', value: 'Deutschland' }),
    })

    // B has no ch-wohnsitz, so ch-nichtrueckkehrtage is unreachable for B even though A answered it.
    const bWrite = await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview/antworten`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: userB.cookie },
      body: JSON.stringify({ questionId: 'ch-nichtrueckkehrtage', value: '10' }),
    })
    expect(bWrite.status).toBe(409)

    const asB = await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview`, { headers: { cookie: userB.cookie } })
    expect(((await asB.json()) as { answers: Record<string, string> }).answers).toEqual({})

    const rowsA = await interviewRows(userA.userId)
    expect(rowsA).toHaveLength(1)
  })

  it('the CH answer value is ciphertext at rest, checked by raw SQL (ADR-0008, same house pattern as REQ-015)', async () => {
    const { cookie, userId } = await signUp('ch-cipher@example.com')

    await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview/antworten`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ questionId: 'ch-wohnsitz', value: 'Deutschland' }),
    })

    const rawRows = await prisma.$queryRaw<{ value: string }[]>`
      SELECT "value" FROM "InterviewAnswer" WHERE "userId" = ${userId} AND "questionId" = 'ch-wohnsitz'
    `
    expect(rawRows).toHaveLength(1)
    expect(rawRows[0]!.value).not.toBe('Deutschland')
    expect(rawRows[0]!.value).toMatch(/^v\d+\.aesgcm256\./)
  })
})
