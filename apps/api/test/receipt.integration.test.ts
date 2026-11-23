// Real-Postgres cascade (ADR-0004) for the Beleg-Posteingang (ADR-007/008). Run via
// `pnpm --filter @steuereule/api test:integration` against a migrated database — never the
// plain no-DB job. Proves the derived-Zuordnung through the real PrismaBelegRepository,
// the real (userId) scoping, field-encryption at rest (dateiname), and the audit entries.
// Mirrors cockpit.integration.test.ts: Beleg is guest-compatible (UserContextGuard, no
// @RequiresAccount), so the tests mint a guest cookie rather than sign up an account.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import fastifyCookie from '@fastify/cookie'
import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module.js'
import { resolveGuestSessionSecret, verifyGuestSession } from '../src/auth/guest-session.js'
import { validationExceptionFactory } from '../src/common/validation-exception-factory.js'
import { PrismaService } from '../src/prisma/prisma.service.js'
import { RECEIPT_REPOSITORY, type ReceiptRepository } from '../src/receipt/receipt.repository.js'
import { extractSessionCookie } from './support/build-test-app.js'

/** Recovers the trusted userId the app minted, from the raw `Set-Cookie`/`Cookie` pair. */
function userIdFromCookie(cookie: string): string {
  const rawValue = cookie.slice(cookie.indexOf('=') + 1)
  const userId = verifyGuestSession(decodeURIComponent(rawValue), resolveGuestSessionSecret())
  if (!userId) {
    throw new Error('test harness: could not recover userId from the session cookie')
  }
  return userId
}

describe('POST/GET /v1/belege — real Postgres (ADR-007/008)', () => {
  let app: NestFastifyApplication
  let prisma: PrismaClient

  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
      logger: false,
    })
    await app.register(fastifyCookie)
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: validationExceptionFactory,
      }),
    )
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
    prisma = app.get(PrismaService)
  })

  afterEach(async () => {
    await prisma.receipt.deleteMany()
    await prisma.$executeRawUnsafe(`DELETE FROM "TaxDataAccessLog"`)
  })

  afterAll(async () => {
    await app.close()
  })

  async function createReceipt(
    cookie: string,
    payload: Record<string, unknown>,
  ): Promise<{ statusCode: number; body: Record<string, unknown> }> {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/belege',
      headers: { cookie },
      payload,
    })
    return { statusCode: response.statusCode, body: response.json() as Record<string, unknown> }
  }

  it('a Beleg with no dates lands UNBOUND (ADR-007), 201, and is read back by the inbox', async () => {
    const first = await app.inject({ method: 'GET', url: '/v1/belege' })
    const cookie = extractSessionCookie(first.headers['set-cookie'])!

    const created = await createReceipt(cookie, { fileName: 'quittung.pdf' })
    expect(created.statusCode).toBe(201)
    expect(created.body).toMatchObject({
      fileName: 'quittung.pdf',
      belegdatum: null,
      zahlungsdatum: null,
      assignment: { kind: 'ungebunden' },
    })

    const list = await app.inject({ method: 'GET', url: '/v1/belege', headers: { cookie } })
    expect(list.statusCode).toBe(200)
    expect(list.json().items).toHaveLength(1)
    expect(list.json().counts).toMatchObject({ total: 1, open: 1 })
    expect(list.json().items[0]).toMatchObject({ fileName: 'quittung.pdf', assignment: { kind: 'ungebunden' } })
  })

  it('the year suggestion prefers the payment date over the invoice date (§ 11 Zufluss) — the cross-year case', async () => {
    const first = await app.inject({ method: 'GET', url: '/v1/belege' })
    const cookie = extractSessionCookie(first.headers['set-cookie'])!

    const created = await createReceipt(cookie, {
      fileName: 'miete-dez.pdf',
      belegdatum: '2025-12-20',
      zahlungsdatum: '2026-01-15',
    })
    expect(created.statusCode).toBe(201)
    // Rechnungsdatum 2025, Zahlungsdatum 2026 → 2026 (the silent error ADR-007 names).
    expect(created.body.assignment).toEqual({ kind: 'vorgeschlagen', taxYear: 2026, provenance: 'zahlungsdatum' })
  })

  it('confirming the suggested year → zugeordnet; a contradicting assignment → konflikt with both years visible (ADR-008)', async () => {
    const first = await app.inject({ method: 'GET', url: '/v1/belege' })
    const cookie = extractSessionCookie(first.headers['set-cookie'])!
    const created = await createReceipt(cookie, { fileName: 'a.pdf', zahlungsdatum: '2026-01-15' })
    const id = created.body.id as string

    const confirm = await app.inject({
      method: 'POST',
      url: `/v1/belege/${id}/zuordnung`,
      headers: { cookie },
      payload: { taxYear: 2026 },
    })
    expect(confirm.statusCode).toBe(200)
    expect(confirm.json().assignment).toEqual({ kind: 'zugeordnet', taxYear: 2026 })

    // Re-assign to a year that contradicts the dates → visible konflikt, never a silent overwrite.
    const conflict = await app.inject({
      method: 'POST',
      url: `/v1/belege/${id}/zuordnung`,
      headers: { cookie },
      payload: { taxYear: 2025 },
    })
    expect(conflict.statusCode).toBe(200)
    expect(conflict.json().assignment).toEqual({
      kind: 'konflikt',
      taxYear: 2025,
      proposalYear: 2026,
      provenance: 'zahlungsdatum',
    })
  })

  it('dismissing a contradicting suggestion resolves the conflict to zugeordnet on the user’s own year (ADR-008 "bei meinem Jahr bleiben")', async () => {
    const first = await app.inject({ method: 'GET', url: '/v1/belege' })
    const cookie = extractSessionCookie(first.headers['set-cookie'])!
    const created = await createReceipt(cookie, { fileName: 'a.pdf', zahlungsdatum: '2026-01-15' })
    const id = created.body.id as string

    const conflict = await app.inject({
      method: 'POST',
      url: `/v1/belege/${id}/zuordnung`,
      headers: { cookie },
      payload: { taxYear: 2025 },
    })
    expect(conflict.json().assignment).toMatchObject({ kind: 'konflikt', taxYear: 2025, proposalYear: 2026 })

    // "bei meinem Jahr bleiben": keep 2025, dismiss the 2026 suggestion → zugeordnet, no dead end.
    const resolved = await app.inject({
      method: 'POST',
      url: `/v1/belege/${id}/zuordnung`,
      headers: { cookie },
      payload: { taxYear: 2025, proposalDismissed: true },
    })
    expect(resolved.statusCode).toBe(200)
    expect(resolved.json().assignment).toEqual({ kind: 'zugeordnet', taxYear: 2025 })
  })

  it('cross-user isolation: user B never sees or reassigns user A’s Beleg', async () => {
    const first = await app.inject({ method: 'GET', url: '/v1/belege' })
    const cookieA = extractSessionCookie(first.headers['set-cookie'])!
    await createReceipt(cookieA, { fileName: 'a.pdf' })

    const userB = await app.inject({ method: 'GET', url: '/v1/belege' })
    const cookieB = extractSessionCookie(userB.headers['set-cookie'])!
    // The inbox answers one page with its counts (e52771f4).
    expect(userB.json().items).toEqual([])
    expect(userB.json().counts.total).toBe(0)

    // Reassigning user A's id as user B → 404, never a leak.
    const created = await app.inject({ method: 'GET', url: '/v1/belege', headers: { cookie: cookieA } })
    const idA = created.json().items[0].id as string
    const foreign = await app.inject({
      method: 'POST',
      url: `/v1/belege/${idA}/zuordnung`,
      headers: { cookie: cookieB },
      payload: { taxYear: 2026 },
    })
    expect(foreign.statusCode).toBe(404)
  })

  it('dateiname is ciphertext at rest (ADR-0008), checked by raw SQL', async () => {
    const first = await app.inject({ method: 'GET', url: '/v1/belege' })
    const cookie = extractSessionCookie(first.headers['set-cookie'])!
    const userId = userIdFromCookie(cookie)
    await createReceipt(cookie, { fileName: 'quittung.pdf' })

    const rawRows = await prisma.$queryRaw<{ dateiname: string }[]>`
      SELECT "dateiname" FROM "Beleg" WHERE "userId" = ${userId}
    `
    expect(rawRows).toHaveLength(1)
    expect(rawRows[0]!.dateiname).not.toBe('quittung.pdf')
    expect(rawRows[0]!.dateiname).toMatch(/^v\d+\.aesgcm256\./)
  })

  it('audit: each create and each assignment appends exactly one WRITE entry; a list appends one READ entry (REQ-004)', async () => {
    const first = await app.inject({ method: 'GET', url: '/v1/belege' })
    const cookie = extractSessionCookie(first.headers['set-cookie'])!
    const userId = userIdFromCookie(cookie)

    const created = await createReceipt(cookie, { fileName: 'a.pdf' })
    await app.inject({
      method: 'POST',
      url: `/v1/belege/${created.body.id as string}/zuordnung`,
      headers: { cookie },
      payload: { taxYear: 2026 },
    })
    await app.inject({ method: 'GET', url: '/v1/belege', headers: { cookie } })

    const writes = await prisma.$queryRaw<{ action: string; resource: string }[]>`
      SELECT "action", "resource" FROM "TaxDataAccessLog" WHERE "userId" = ${userId} AND "action" = 'WRITE'
    `
    const reads = await prisma.$queryRaw<{ action: string; resource: string }[]>`
      SELECT "action", "resource" FROM "TaxDataAccessLog" WHERE "userId" = ${userId} AND "action" = 'READ'
    `
    expect(writes.filter((r) => r.resource === 'beleg')).toHaveLength(2) // create + assignment
    expect(reads.filter((r) => r.resource === 'beleg')).toHaveLength(1) // the non-empty list
  })

  it('a CH document type (ADR-029) persists and reads back; an invalid art is rejected with 400', async () => {
    const first = await app.inject({ method: 'GET', url: '/v1/belege' })
    const cookie = extractSessionCookie(first.headers['set-cookie'])!

    const created = await createReceipt(cookie, { fileName: 'lohnausweis.pdf', kind: 'Lohnausweis' })
    expect(created.statusCode).toBe(201)
    expect(created.body).toMatchObject({ fileName: 'lohnausweis.pdf', kind: 'Lohnausweis' })

    const list = await app.inject({ method: 'GET', url: '/v1/belege', headers: { cookie } })
    expect(list.json().items[0]).toMatchObject({ kind: 'Lohnausweis' })

    const invalid = await createReceipt(cookie, { fileName: 'x.pdf', kind: 'LStB' })
    expect(invalid.statusCode).toBe(400)
    await expect(prisma.receipt.count()).resolves.toBe(1)
  })

  it('rejects a malformed date with 400 and persists nothing', async () => {
    const first = await app.inject({ method: 'GET', url: '/v1/belege' })
    const cookie = extractSessionCookie(first.headers['set-cookie'])!

    const response = await createReceipt(cookie, { fileName: 'a.pdf', zahlungsdatum: 'nicht-ein-datum' })
    expect(response.statusCode).toBe(400)
    await expect(prisma.receipt.count()).resolves.toBe(0)
  })
  it('pages the inbox over the cursor and keeps the folder on every page (keyset on createdAt, id)', async () => {
    const first = await app.inject({ method: 'GET', url: '/v1/belege' })
    const cookie = extractSessionCookie(first.headers['set-cookie'])!
    for (const n of [1, 2, 3, 4, 5]) expect((await createReceipt(cookie, { fileName: `sonstiges-${n}.pdf`, kind: 'Sonstiges' })).statusCode).toBe(201)
    for (const n of [1, 2]) expect((await createReceipt(cookie, { fileName: `lohn-${n}.pdf`, kind: 'Lohnausweis' })).statusCode).toBe(201)

    const names: string[] = []
    let cursor: string | null = null
    do {
      const url: string = `/v1/belege?ordner=weitere&limit=2${cursor ? `&cursor=${cursor}` : ''}`
      const page = (await app.inject({ method: 'GET', url, headers: { cookie } })).json() as { items: { fileName: string }[]; nextCursor: string | null; counts: { total: number; folders: { weitere: number; einkuenfte: number } } }
      names.push(...page.items.map((item) => item.fileName))
      expect(page.counts).toMatchObject({ total: 7, folders: { weitere: 5, einkuenfte: 2 } })
      cursor = page.nextCursor
    } while (cursor !== null)

    expect(names).toEqual(['sonstiges-5.pdf', 'sonstiges-4.pdf', 'sonstiges-3.pdf', 'sonstiges-2.pdf', 'sonstiges-1.pdf'])
  })

  // Review of ADR-0108: the row cap used to count first and create afterwards, so requests in parallel all
  // read a count below the cap and all created their row. Counting and creating are now one step per account.
  it('ADR-0108: creates in parallel stop exactly at the row cap, per account', async () => {
    const repository = app.get<ReceiptRepository>(RECEIPT_REPOSITORY)
    const cap = 3

    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) => repository.create('row-cap-user', { fileName: `parallel-${i}.pdf` }, cap)),
    )

    expect(results.filter((record) => record !== null)).toHaveLength(cap)
    expect(await prisma.receipt.count({ where: { userId: 'row-cap-user' } })).toBe(cap)
    // Another account has its own count and its own lock.
    expect(await repository.create('row-cap-other', { fileName: 'other.pdf' }, cap)).not.toBeNull()
  })
})
