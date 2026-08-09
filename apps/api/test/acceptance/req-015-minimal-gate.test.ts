// REQ-015 — the Minimal-Gate (#318, Segment 1 of ADR-0031). Real Postgres, real HTTP
// against the actual `buildApp()` boot from src/main.ts (never `.inject()`) — the
// acceptance tier the register's `Done` binds to (Musti's #249 R2 ruling).
//
// Covers the ticket's Given–When–Then in full, plus its named red-proof table:
//   P2 — a POST of an unreachable answer is rejected and no row is created
//   P3 — a guest (no account session) gets 401 on both endpoints, no row created
//   P4 — user B can neither read nor write user A's answers
//   P5 — `value` is ciphertext at rest, checked by raw SQL, never the Prisma client
//   P6 — vertical: real Postgres, real socket, three answers, rows + TaxYear.openItems
// P1 (table-driven graph coverage) is packages/core's own suite
// (packages/core/src/interview.test.ts, task 0, ADR-0033) — not duplicated here; this
// file's GWT walk-through is an end-to-end identity check at the API layer, not a
// restatement of P1. P7 (no localStorage) is the frontend track's proof (Kaan, #318
// 1b/2) — nothing here writes to a browser at all.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

process.env.GUEST_SESSION_SECRET = 'req-015-secret'
process.env.BETTER_AUTH_SECRET = 'req-015-better-auth-secret-0123456789'
process.env.BETTER_AUTH_URL = 'http://127.0.0.1:39991'

const ALLOWED_ORIGIN = 'https://allowed.example.com'
process.env.CORS_ALLOWED_ORIGINS = ALLOWED_ORIGIN
// Node's fetch() sends Sec-Fetch-Mode by default, so every state-changing better-auth
// call needs a trusted Origin, same as a real browser (see req-005/req-006/req-009).
const TRUSTED_ORIGIN_HEADERS = { origin: ALLOWED_ORIGIN }

const STEUERJAHR = 2026

type InterviewAnswerRow = { userId: string; steuerjahr: number; questionId: string; value: string }

describe('REQ-015 — the Minimal-Gate, against the real server', () => {
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
    await prisma.$executeRawUnsafe(`DELETE FROM "InterviewAnswer"`)
    await prisma.taxYear.deleteMany()
    await prisma.$executeRawUnsafe(`DELETE FROM "TaxDataAccessLog"`)
    await prisma.session.deleteMany()
    await prisma.account.deleteMany()
    await prisma.user.deleteMany()
    await prisma.rateLimit.deleteMany()
  })

  afterAll(async () => {
    await app.close()
  })

  /** Signs up a fresh account over real HTTP and returns its session cookie + userId. */
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

  it(
    'GWT — three questions answered in order persist server-side, never in the request/response as client state, ' +
      'and each response names the exact next step the graph defines',
    async () => {
      const { cookie } = await signUp('gwt@example.com')

      const initial = await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview`, { headers: { cookie } })
      expect(initial.status).toBe(200)
      expect(await initial.json()).toEqual({
        answers: {},
        nextStep: { kind: 'question', id: 'job' },
        openItems: 3,
      })

      const job = await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview/antworten`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ questionId: 'job', value: 'Angestellt' }),
      })
      expect(job.status).toBe(200)
      expect(await job.json()).toEqual({ nextStep: { kind: 'question', id: 'ausland' }, openItems: 2 })

      const ausland = await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview/antworten`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ questionId: 'ausland', value: 'Nein' }),
      })
      expect(await ausland.json()).toEqual({ nextStep: { kind: 'question', id: 'kinder' }, openItems: 1 })

      const kinder = await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview/antworten`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ questionId: 'kinder', value: '1 Kind' }),
      })
      expect(await kinder.json()).toEqual({ nextStep: { kind: 'done' }, openItems: 0 })

      const final = await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview`, { headers: { cookie } })
      expect(await final.json()).toEqual({
        answers: { job: 'Angestellt', ausland: 'Nein', kinder: '1 Kind' },
        nextStep: { kind: 'done' },
        openItems: 0,
      })
    },
  )

  it('GWT — "Selbstständig" on question 1 makes the Gewerbe-Gate the next screen', async () => {
    const { cookie } = await signUp('gwt-gewerbe@example.com')

    const response = await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview/antworten`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ questionId: 'job', value: 'Selbstständig' }),
    })

    expect(await response.json()).toEqual({ nextStep: { kind: 'gate', id: 'gewerbe' }, openItems: 0 })
  })

  it('GWT — "In ein anderes Land" on question 2 makes the CH-only-Gate the next screen', async () => {
    const { cookie } = await signUp('gwt-chonly@example.com')

    await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview/antworten`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ questionId: 'job', value: 'Angestellt' }),
    })
    const response = await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview/antworten`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ questionId: 'ausland', value: 'In ein anderes Land' }),
    })

    expect(await response.json()).toEqual({ nextStep: { kind: 'gate', id: 'ch-only' }, openItems: 1 })
  })

  it('a terminal Gewerbe-Gate (Selbstständig) rejects every answer behind it, acknowledged or not', async () => {
    const { cookie, userId } = await signUp('terminal-gate@example.com')

    await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview/antworten`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ questionId: 'job', value: 'Selbstständig' }),
    })
    await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview/antworten`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ questionId: 'gewerbe', value: 'weiter' }),
    })

    const blocked = await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview/antworten`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ questionId: 'ausland', value: 'Nein' }),
    })
    expect(blocked.status).toBe(409)

    const rows = await interviewRows(userId)
    expect(rows.map((r) => r.questionId).sort()).toEqual(['gewerbe', 'job'])
  })

  describe('P2 — server-side path validation: the reason the graph lives in packages/core', () => {
    it('rejects (409) a POST for a step not reached yet, and creates no row', async () => {
      const { cookie, userId } = await signUp('p2-unreachable@example.com')

      // No `job` answered — `ausland` was never offered.
      const response = await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview/antworten`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ questionId: 'ausland', value: 'Nein' }),
      })

      expect(response.status).toBe(409)
      await expect(interviewRows(userId)).resolves.toEqual([])
    })

    it('rejects (400) a value outside the accepted set for a reachable step, and creates no row', async () => {
      const { cookie, userId } = await signUp('p2-invalid-value@example.com')

      const response = await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview/antworten`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ questionId: 'job', value: 'Freiberuflich' }),
      })

      expect(response.status).toBe(400)
      await expect(interviewRows(userId)).resolves.toEqual([])
    })

    it('rejects (409) an entirely unknown questionId smuggled into the body, and creates no row', async () => {
      const { cookie, userId } = await signUp('p2-unknown-id@example.com')

      const response = await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview/antworten`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ questionId: 'vermietung', value: 'Ja' }),
      })

      expect(response.status).toBe(409)
      await expect(interviewRows(userId)).resolves.toEqual([])
    })
  })

  describe('P3 — no guest path: @RequiresAccount() rejects a guest with 401 on both endpoints', () => {
    it('GET without an account session is 401', async () => {
      const response = await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview`)
      expect(response.status).toBe(401)
    })

    it('POST without an account session is 401 and creates no row', async () => {
      const response = await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview/antworten`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ questionId: 'job', value: 'Angestellt' }),
      })
      expect(response.status).toBe(401)

      const rows = await prisma.$queryRaw<InterviewAnswerRow[]>`SELECT "userId", "steuerjahr", "questionId", "value" FROM "InterviewAnswer"`
      expect(rows).toEqual([])
    })

    it('a guest COOKIE (no real account session) is also rejected with 401, not silently treated as an account', async () => {
      // A guest cookie is minted by any unauthenticated GET on a route behind
      // UserContextGuard — the cockpit endpoint mints one without touching interview.
      const guestProbe = await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/cockpit`)
      const guestCookie = guestProbe.headers.get('set-cookie')!.split(';')[0]!

      const response = await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview`, {
        headers: { cookie: guestCookie },
      })
      expect(response.status).toBe(401)
    })
  })

  describe('P4 — cross-user isolation: user B can neither read nor write user A’s answers', () => {
    it('GET: user B never sees user A’s stored answers, even for the same tax year', async () => {
      const userA = await signUp('p4-a-read@example.com')
      const userB = await signUp('p4-b-read@example.com')

      await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview/antworten`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: userA.cookie },
        body: JSON.stringify({ questionId: 'job', value: 'Angestellt' }),
      })

      const asB = await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview`, {
        headers: { cookie: userB.cookie },
      })
      expect(await asB.json()).toEqual({ answers: {}, nextStep: { kind: 'question', id: 'job' }, openItems: 3 })

      const asA = await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview`, {
        headers: { cookie: userA.cookie },
      })
      expect(await asA.json()).toEqual({
        answers: { job: 'Angestellt' },
        nextStep: { kind: 'question', id: 'ausland' },
        openItems: 2,
      })
    })

    it('POST: user B’s write never lands under user A’s userId, and never reads user A’s path to decide reachability', async () => {
      const userA = await signUp('p4-a-write@example.com')
      const userB = await signUp('p4-b-write@example.com')

      // User A has answered `job`, so `ausland` is reachable — but only for user A.
      await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview/antworten`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: userA.cookie },
        body: JSON.stringify({ questionId: 'job', value: 'Angestellt' }),
      })

      // User B, with no answers of their own, must NOT be able to write `ausland`.
      const bWrite = await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview/antworten`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: userB.cookie },
        body: JSON.stringify({ questionId: 'ausland', value: 'Nein' }),
      })
      expect(bWrite.status).toBe(409)

      const rowsA = await interviewRows(userA.userId)
      const rowsB = await interviewRows(userB.userId)
      expect(rowsA).toHaveLength(1)
      expect(rowsB).toHaveLength(0)
    })
  })

  describe('P5 — value is ciphertext at rest, checked by raw SQL, never through the Prisma client', () => {
    it('a real POST’s value is not stored as plaintext in the database column', async () => {
      const { cookie, userId } = await signUp('p5-ciphertext@example.com')

      const response = await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview/antworten`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ questionId: 'job', value: 'Angestellt' }),
      })
      expect(response.status).toBe(200)

      const rawRows = await prisma.$queryRaw<{ value: string }[]>`
        SELECT "value" FROM "InterviewAnswer" WHERE "userId" = ${userId} AND "questionId" = 'job'
      `
      expect(rawRows).toHaveLength(1)
      const rawValue = rawRows[0]!.value

      expect(rawValue).not.toBe('Angestellt')
      expect(rawValue.length).toBeGreaterThan('Angestellt'.length)
      // prisma-field-encryption's cloak envelope: "<envelopeVersion>.aesgcm256.<fingerprint>.<iv>.<ciphertext>"
      expect(rawValue).toMatch(/^v\d+\.aesgcm256\./)
    })

    it('two rows with the same plaintext value have different ciphertext at rest (randomized nonce per write)', async () => {
      const userA = await signUp('p5-random-a@example.com')
      const userB = await signUp('p5-random-b@example.com')

      for (const user of [userA, userB]) {
        await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview/antworten`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie: user.cookie },
          body: JSON.stringify({ questionId: 'job', value: 'Angestellt' }),
        })
      }

      const rawA = await prisma.$queryRaw<{ value: string }[]>`
        SELECT "value" FROM "InterviewAnswer" WHERE "userId" = ${userA.userId} AND "questionId" = 'job'
      `
      const rawB = await prisma.$queryRaw<{ value: string }[]>`
        SELECT "value" FROM "InterviewAnswer" WHERE "userId" = ${userB.userId} AND "questionId" = 'job'
      `
      expect(rawA[0]!.value).not.toBe(rawB[0]!.value)
    })
  })

  describe('P6 — vertical, real stack: answer three questions, check the rows and TaxYear.openItems', () => {
    it('three real HTTP POSTs leave exactly three InterviewAnswer rows and TaxYear.openItems counting down to 0', async () => {
      const { cookie, userId } = await signUp('p6-vertical@example.com')

      await expect(prisma.taxYear.findUnique({ where: { userId_steuerjahr: { userId, steuerjahr: STEUERJAHR } } })).resolves.toBeNull()

      await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview/antworten`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ questionId: 'job', value: 'Angestellt' }),
      })
      let taxYear = await prisma.taxYear.findUnique({ where: { userId_steuerjahr: { userId, steuerjahr: STEUERJAHR } } })
      expect(taxYear?.openItems).toBe(2)

      await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview/antworten`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ questionId: 'ausland', value: 'Nein' }),
      })
      taxYear = await prisma.taxYear.findUnique({ where: { userId_steuerjahr: { userId, steuerjahr: STEUERJAHR } } })
      expect(taxYear?.openItems).toBe(1)

      await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview/antworten`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ questionId: 'kinder', value: 'Nein' }),
      })
      taxYear = await prisma.taxYear.findUnique({ where: { userId_steuerjahr: { userId, steuerjahr: STEUERJAHR } } })
      expect(taxYear?.openItems).toBe(0)

      const rows = await interviewRows(userId)
      expect(rows).toHaveLength(3)
      expect(rows.map((r) => r.questionId).sort()).toEqual(['ausland', 'job', 'kinder'])
      expect(rows.every((r) => r.steuerjahr === STEUERJAHR)).toBe(true)
    })
  })

  describe('audit trail (ADR-0008) — the same house pattern as Profile', () => {
    it('each admitted write appends exactly one WRITE audit entry, atomic with the answer row', async () => {
      const { cookie, userId } = await signUp('audit-write@example.com')

      await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview/antworten`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ questionId: 'job', value: 'Angestellt' }),
      })

      const rows = await prisma.$queryRaw<{ action: string; resource: string }[]>`
        SELECT "action", "resource" FROM "TaxDataAccessLog" WHERE "userId" = ${userId}
      `
      expect(rows.filter((r) => r.action === 'WRITE' && r.resource === 'interview')).toHaveLength(1)
    })

    it('a rejected write (409/400) appends no audit entry', async () => {
      const { cookie, userId } = await signUp('audit-rejected@example.com')

      await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview/antworten`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ questionId: 'ausland', value: 'Nein' }),
      })

      const rows = await prisma.$queryRaw<{ action: string }[]>`
        SELECT "action" FROM "TaxDataAccessLog" WHERE "userId" = ${userId}
      `
      expect(rows).toEqual([])
    })

    it('a real GET on an unanswered tax year appends no READ entry; a GET after an answer appends exactly one', async () => {
      const { cookie, userId } = await signUp('audit-read@example.com')

      await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview`, { headers: { cookie } })
      const emptyReads = await prisma.$queryRaw<{ action: string }[]>`
        SELECT "action" FROM "TaxDataAccessLog" WHERE "userId" = ${userId} AND "action" = 'READ'
      `
      expect(emptyReads).toEqual([])

      await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview/antworten`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ questionId: 'job', value: 'Angestellt' }),
      })
      await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview`, { headers: { cookie } })

      const reads = await prisma.$queryRaw<{ action: string; resource: string }[]>`
        SELECT "action", "resource" FROM "TaxDataAccessLog" WHERE "userId" = ${userId} AND "action" = 'READ' AND "resource" = 'interview'
      `
      expect(reads).toHaveLength(1)
    })
  })

  it('re-answering an already-answered, still-reachable question is idempotent (back navigation between the three questions)', async () => {
    const { cookie, userId } = await signUp('back-nav@example.com')

    await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview/antworten`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ questionId: 'job', value: 'Angestellt' }),
    })
    const secondAnswer = await fetch(`${baseUrl}/v1/steuerjahre/${STEUERJAHR}/interview/antworten`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ questionId: 'job', value: 'Rente' }),
    })
    expect(await secondAnswer.json()).toEqual({ nextStep: { kind: 'question', id: 'ausland' }, openItems: 2 })

    const rows = await interviewRows(userId)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.questionId).toBe('job')
  })
})
