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
    await prisma.beleg.deleteMany()
    await prisma.$executeRawUnsafe(`DELETE FROM "TaxDataAccessLog"`)
  })

  afterAll(async () => {
    await app.close()
  })

  async function createBeleg(
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

    const created = await createBeleg(cookie, { dateiname: 'quittung.pdf' })
    expect(created.statusCode).toBe(201)
    expect(created.body).toMatchObject({
      dateiname: 'quittung.pdf',
      belegdatum: null,
      zahlungsdatum: null,
      zuordnung: { kind: 'ungebunden' },
    })

    const list = await app.inject({ method: 'GET', url: '/v1/belege', headers: { cookie } })
    expect(list.statusCode).toBe(200)
    expect(list.json()).toHaveLength(1)
    expect(list.json()[0]).toMatchObject({ dateiname: 'quittung.pdf', zuordnung: { kind: 'ungebunden' } })
  })

  it('the year suggestion prefers the payment date over the invoice date (§ 11 Zufluss) — the cross-year case', async () => {
    const first = await app.inject({ method: 'GET', url: '/v1/belege' })
    const cookie = extractSessionCookie(first.headers['set-cookie'])!

    const created = await createBeleg(cookie, {
      dateiname: 'miete-dez.pdf',
      belegdatum: '2025-12-20',
      zahlungsdatum: '2026-01-15',
    })
    expect(created.statusCode).toBe(201)
    // Rechnungsdatum 2025, Zahlungsdatum 2026 → 2026 (the silent error ADR-007 names).
    expect(created.body.zuordnung).toEqual({ kind: 'vorgeschlagen', steuerjahr: 2026, herkunft: 'zahlungsdatum' })
  })

  it('confirming the suggested year → zugeordnet; a contradicting assignment → konflikt with both years visible (ADR-008)', async () => {
    const first = await app.inject({ method: 'GET', url: '/v1/belege' })
    const cookie = extractSessionCookie(first.headers['set-cookie'])!
    const created = await createBeleg(cookie, { dateiname: 'a.pdf', zahlungsdatum: '2026-01-15' })
    const id = created.body.id as string

    const confirm = await app.inject({
      method: 'POST',
      url: `/v1/belege/${id}/zuordnung`,
      headers: { cookie },
      payload: { steuerjahr: 2026 },
    })
    expect(confirm.statusCode).toBe(200)
    expect(confirm.json().zuordnung).toEqual({ kind: 'zugeordnet', steuerjahr: 2026 })

    // Re-assign to a year that contradicts the dates → visible konflikt, never a silent overwrite.
    const conflict = await app.inject({
      method: 'POST',
      url: `/v1/belege/${id}/zuordnung`,
      headers: { cookie },
      payload: { steuerjahr: 2025 },
    })
    expect(conflict.statusCode).toBe(200)
    expect(conflict.json().zuordnung).toEqual({
      kind: 'konflikt',
      steuerjahr: 2025,
      vorschlagsJahr: 2026,
      herkunft: 'zahlungsdatum',
    })
  })

  it('cross-user isolation: user B never sees or reassigns user A’s Beleg', async () => {
    const first = await app.inject({ method: 'GET', url: '/v1/belege' })
    const cookieA = extractSessionCookie(first.headers['set-cookie'])!
    await createBeleg(cookieA, { dateiname: 'a.pdf' })

    const userB = await app.inject({ method: 'GET', url: '/v1/belege' })
    const cookieB = extractSessionCookie(userB.headers['set-cookie'])!
    expect(userB.json()).toEqual([])

    // Reassigning user A's id as user B → 404, never a leak.
    const created = await app.inject({ method: 'GET', url: '/v1/belege', headers: { cookie: cookieA } })
    const idA = created.json()[0].id as string
    const foreign = await app.inject({
      method: 'POST',
      url: `/v1/belege/${idA}/zuordnung`,
      headers: { cookie: cookieB },
      payload: { steuerjahr: 2026 },
    })
    expect(foreign.statusCode).toBe(404)
  })

  it('dateiname is ciphertext at rest (ADR-0008), checked by raw SQL', async () => {
    const first = await app.inject({ method: 'GET', url: '/v1/belege' })
    const cookie = extractSessionCookie(first.headers['set-cookie'])!
    const userId = userIdFromCookie(cookie)
    await createBeleg(cookie, { dateiname: 'quittung.pdf' })

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

    const created = await createBeleg(cookie, { dateiname: 'a.pdf' })
    await app.inject({
      method: 'POST',
      url: `/v1/belege/${created.body.id as string}/zuordnung`,
      headers: { cookie },
      payload: { steuerjahr: 2026 },
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

    const created = await createBeleg(cookie, { dateiname: 'lohnausweis.pdf', art: 'Lohnausweis' })
    expect(created.statusCode).toBe(201)
    expect(created.body).toMatchObject({ dateiname: 'lohnausweis.pdf', art: 'Lohnausweis' })

    const list = await app.inject({ method: 'GET', url: '/v1/belege', headers: { cookie } })
    expect(list.json()[0]).toMatchObject({ art: 'Lohnausweis' })

    const invalid = await createBeleg(cookie, { dateiname: 'x.pdf', art: 'LStB' })
    expect(invalid.statusCode).toBe(400)
    await expect(prisma.beleg.count()).resolves.toBe(1)
  })

  it('rejects a malformed date with 400 and persists nothing', async () => {
    const first = await app.inject({ method: 'GET', url: '/v1/belege' })
    const cookie = extractSessionCookie(first.headers['set-cookie'])!

    const response = await createBeleg(cookie, { dateiname: 'a.pdf', zahlungsdatum: 'nicht-ein-datum' })
    expect(response.statusCode).toBe(400)
    await expect(prisma.beleg.count()).resolves.toBe(0)
  })
})
