// Real-Postgres cascade (ADR-0004). Run via `pnpm --filter @steuereule/api
// test:integration` against a migrated database (`DATABASE_URL` set, migrations
// applied via `prisma migrate deploy`) — e.g. the compose/testcontainers stage, never
// the plain no-DB `pnpm -r test` job. Proves the same contract as profile.http.test.ts
// but through the real PrismaProfileRepository and the real unique-userId constraint.
//
// ATDD (Slice 1, issues #39/#40 — REQ-003 encrypted profile persistence, REQ-004
// immutable audit log): the REQ-tagged tests below are written RED, before Robin's
// implementation. They deliberately go through raw SQL (`prisma.$queryRaw` /
// `$executeRaw`), never the generated Prisma Client model API, for two reasons:
//   1. `prisma-field-encryption` is a Prisma **client extension** that intercepts the
//      generated model methods (findUnique/upsert/...) — raw SQL bypasses it entirely,
//      which is exactly what "read the ciphertext actually at rest" requires.
//   2. Neither the `/// @encrypted` annotation nor the `TaxDataAccessLog` model exist
//      in schema.prisma yet, so referencing `prisma.taxDataAccessLog.*` would be a
//      *compile* error (a broken harness), not a red assertion. Raw SQL compiles today
//      and fails at **query time** for the right reason (missing column semantics /
//      missing table) until Robin lands the schema + implementation.
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

const VALID_PAYLOAD = {
  firstName: 'Anna',
  lastName: 'Beispiel',
  steuerId: '02476291358',
  steuernummer: '18181508155',
}

/** Recovers the trusted userId the app minted, from the raw `Set-Cookie`/`Cookie` pair. */
function userIdFromCookie(cookie: string): string {
  const rawValue = cookie.slice(cookie.indexOf('=') + 1)
  const userId = verifyGuestSession(decodeURIComponent(rawValue), resolveGuestSessionSecret())
  if (!userId) {
    throw new Error('test harness: could not recover userId from the session cookie')
  }
  return userId
}

/** Raw-SQL read of a Profile column, bypassing any Prisma client extension entirely. */
async function rawProfileColumn(
  prisma: PrismaClient,
  userId: string,
  column: 'steuerId' | 'steuernummer',
): Promise<string | null> {
  const rows =
    column === 'steuerId'
      ? await prisma.$queryRaw<{ value: string | null }[]>`
          SELECT "steuerId" AS value FROM "Profile" WHERE "userId" = ${userId}
        `
      : await prisma.$queryRaw<{ value: string | null }[]>`
          SELECT "steuernummer" AS value FROM "Profile" WHERE "userId" = ${userId}
        `
  return rows[0]?.value ?? null
}

type AuditRow = { id: string; userId: string; action: string; resource: string; createdAt: Date }

/** Raw-SQL read of TaxDataAccessLog (REQ-004) — the model doesn't exist in the generated
 * Prisma Client yet, so this is the only way to assert on it before Robin's migration lands. */
async function auditRows(prisma: PrismaClient, userId: string): Promise<AuditRow[]> {
  return prisma.$queryRaw<AuditRow[]>`
    SELECT "id", "userId", "action", "resource", "createdAt"
    FROM "TaxDataAccessLog"
    WHERE "userId" = ${userId}
    ORDER BY "createdAt" ASC
  `
}

describe('PROFILE /v1/profile — real Postgres', () => {
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
    await prisma.profile.deleteMany()
    // TaxDataAccessLog doesn't exist until Robin's migration — swallow "relation does
    // not exist" so this cleanup is a no-op today and real cleanup once it lands.
    await prisma.$executeRawUnsafe(`DELETE FROM "TaxDataAccessLog"`).catch(() => undefined)
  })

  afterAll(async () => {
    await app.close()
  })

  it('GET before any PUT returns the well-defined empty/default DTO, never an error', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/profile' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ firstName: null, lastName: null, steuerId: null, steuernummer: null })
  })

  it('REQ-003.1 round-trip: guest PUT then GET returns the same synthetic Steuer-ID in plaintext', async () => {
    const put = await app.inject({ method: 'PUT', url: '/v1/profile', payload: VALID_PAYLOAD })
    expect(put.statusCode).toBe(200)
    const cookie = extractSessionCookie(put.headers['set-cookie'])!

    const get = await app.inject({ method: 'GET', url: '/v1/profile', headers: { cookie } })
    expect(get.json()).toEqual(VALID_PAYLOAD)
  })

  it('PUT twice with the same payload is idempotent — one row in Postgres', async () => {
    const first = await app.inject({ method: 'PUT', url: '/v1/profile', payload: VALID_PAYLOAD })
    const cookie = extractSessionCookie(first.headers['set-cookie'])!
    await app.inject({ method: 'PUT', url: '/v1/profile', payload: VALID_PAYLOAD, headers: { cookie } })

    await expect(prisma.profile.count()).resolves.toBe(1)
  })

  it('an invalid payload (10-digit steuerId) returns 400 and writes zero rows', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/v1/profile',
      payload: { ...VALID_PAYLOAD, steuerId: '1234567890' },
    })
    expect(response.statusCode).toBe(400)
    await expect(prisma.profile.count()).resolves.toBe(0)
  })

  it('an empty name field returns 400 and writes zero rows', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/v1/profile',
      payload: { ...VALID_PAYLOAD, firstName: '' },
    })
    expect(response.statusCode).toBe(400)
    await expect(prisma.profile.count()).resolves.toBe(0)
  })

  it('REQ-003.4 cross-userId isolation: userB GET never sees userA’s row, userB PUT never overwrites userA', async () => {
    const userAPut = await app.inject({ method: 'PUT', url: '/v1/profile', payload: VALID_PAYLOAD })
    const userACookie = extractSessionCookie(userAPut.headers['set-cookie'])!

    const userBGet = await app.inject({ method: 'GET', url: '/v1/profile' })
    expect(userBGet.json()).toEqual({ firstName: null, lastName: null, steuerId: null, steuernummer: null })

    const userBPayload = { ...VALID_PAYLOAD, firstName: 'Jonas', steuerId: '65929970489' }
    await app.inject({ method: 'PUT', url: '/v1/profile', payload: userBPayload })

    const userAGet = await app.inject({ method: 'GET', url: '/v1/profile', headers: { cookie: userACookie } })
    expect(userAGet.json()).toEqual(VALID_PAYLOAD)

    await expect(prisma.profile.count()).resolves.toBe(2)
  })

  // --- Slice 1 (issue #39, REQ-003): Steuer-ID/Steuernummer field-encrypted at rest ---
  // via prisma-field-encryption (AES-256-GCM, randomized), per ADR-0008. RED until
  // Robin adds the `/// @encrypted` annotation + the client extension.
  describe('REQ-003 — encrypted profile persistence at rest', () => {
    it('REQ-003.2 ciphertext at rest (core): a raw-SQL read of steuerId/steuernummer after PUT is not the input plaintext', async () => {
      const put = await app.inject({ method: 'PUT', url: '/v1/profile', payload: VALID_PAYLOAD })
      expect(put.statusCode).toBe(200)
      const cookie = extractSessionCookie(put.headers['set-cookie'])!
      const userId = userIdFromCookie(cookie)

      const rawSteuerId = await rawProfileColumn(prisma, userId, 'steuerId')
      const rawSteuernummer = await rawProfileColumn(prisma, userId, 'steuernummer')

      expect(rawSteuerId).not.toBeNull()
      expect(rawSteuerId).not.toBe(VALID_PAYLOAD.steuerId)
      expect(rawSteuerId!.length).toBeGreaterThan(VALID_PAYLOAD.steuerId.length)
      // prisma-field-encryption's cloak envelope: "<keyLabel>.aesgcm256.<payload>" —
      // namespaced by cipher name, never a bare 11-digit string.
      expect(rawSteuerId).toMatch(/^k\d+\.aesgcm256\./)

      expect(rawSteuernummer).not.toBeNull()
      expect(rawSteuernummer).not.toBe(VALID_PAYLOAD.steuernummer)
      expect(rawSteuernummer).toMatch(/^k\d+\.aesgcm256\./)
    })

    it('REQ-003.3 randomized: two userIds with the same Steuer-ID have different ciphertext at rest', async () => {
      const sameSteuerId = VALID_PAYLOAD.steuerId

      const putA = await app.inject({
        method: 'PUT',
        url: '/v1/profile',
        payload: { ...VALID_PAYLOAD, steuerId: sameSteuerId },
      })
      const userIdA = userIdFromCookie(extractSessionCookie(putA.headers['set-cookie'])!)

      const putB = await app.inject({
        method: 'PUT',
        url: '/v1/profile',
        payload: { ...VALID_PAYLOAD, firstName: 'Jonas', steuerId: sameSteuerId },
      })
      const userIdB = userIdFromCookie(extractSessionCookie(putB.headers['set-cookie'])!)

      const rawA = await rawProfileColumn(prisma, userIdA, 'steuerId')
      const rawB = await rawProfileColumn(prisma, userIdB, 'steuerId')

      expect(rawA).not.toBeNull()
      expect(rawB).not.toBeNull()
      // Same plaintext, different ciphertext — a fresh random IV per write (never
      // assert ciphertext *equality* across writes, only inequality/row-count).
      expect(rawA).not.toBe(rawB)
    })

    it('REQ-003.5 tamper -> integrity: a corrupted ciphertext at rest makes GET fail loudly, never returns garbage or null', async () => {
      const put = await app.inject({ method: 'PUT', url: '/v1/profile', payload: VALID_PAYLOAD })
      const cookie = extractSessionCookie(put.headers['set-cookie'])!
      const userId = userIdFromCookie(cookie)

      await prisma.$executeRaw`
        UPDATE "Profile" SET "steuerId" = 'tampered-not-a-real-ciphertext-envelope' WHERE "userId" = ${userId}
      `

      const get = await app.inject({ method: 'GET', url: '/v1/profile', headers: { cookie } })

      // Must fail loudly (a non-200 error status) — an authenticated-cipher integrity
      // failure, never a silent 200 with the tampered value or a null steuerId.
      expect(get.statusCode).not.toBe(200)
    })
  })

  // --- Slice 1 (issue #40, REQ-004): immutable, append-only audit log of tax-data
  // access. RED until Robin adds the TaxDataAccessLog model + the write-on-access hook.
  describe('REQ-004 — immutable audit log of tax-data access', () => {
    it('REQ-004.1 one entry per write: a successful PUT writes exactly one WRITE audit entry (userId, resource, timestamp; no value)', async () => {
      const put = await app.inject({ method: 'PUT', url: '/v1/profile', payload: VALID_PAYLOAD })
      expect(put.statusCode).toBe(200)
      const userId = userIdFromCookie(extractSessionCookie(put.headers['set-cookie'])!)

      const rows = await auditRows(prisma, userId)
      const writes = rows.filter((row) => row.action === 'WRITE')

      expect(writes).toHaveLength(1)
      expect(writes[0]!.userId).toBe(userId)
      expect(writes[0]!.resource).toBe('profile')
      expect(writes[0]!.createdAt).toBeInstanceOf(Date)
    })

    it('REQ-004.2 read logging: GET on an empty profile appends no READ entry; GET on a saved profile appends exactly one', async () => {
      const emptyGet = await app.inject({ method: 'GET', url: '/v1/profile' })
      const emptyUserId = userIdFromCookie(extractSessionCookie(emptyGet.headers['set-cookie'])!)
      const emptyReads = (await auditRows(prisma, emptyUserId)).filter((row) => row.action === 'READ')
      expect(emptyReads).toHaveLength(0)

      const put = await app.inject({ method: 'PUT', url: '/v1/profile', payload: VALID_PAYLOAD })
      const cookie = extractSessionCookie(put.headers['set-cookie'])!
      const userId = userIdFromCookie(cookie)
      await app.inject({ method: 'GET', url: '/v1/profile', headers: { cookie } })

      const reads = (await auditRows(prisma, userId)).filter((row) => row.action === 'READ')
      expect(reads).toHaveLength(1)
    })

    it('REQ-004.3 append-only: N accesses produce N monotonic entries; no update/delete path is exposed', async () => {
      const put = await app.inject({ method: 'PUT', url: '/v1/profile', payload: VALID_PAYLOAD })
      const cookie = extractSessionCookie(put.headers['set-cookie'])!
      const userId = userIdFromCookie(cookie)

      await app.inject({ method: 'GET', url: '/v1/profile', headers: { cookie } })
      await app.inject({ method: 'GET', url: '/v1/profile', headers: { cookie } })
      await app.inject({ method: 'GET', url: '/v1/profile', headers: { cookie } })

      const reads = (await auditRows(prisma, userId)).filter((row) => row.action === 'READ')
      expect(reads).toHaveLength(3)

      const distinctIds = new Set(reads.map((row) => row.id))
      expect(distinctIds.size).toBe(3)
      for (let i = 1; i < reads.length; i += 1) {
        expect(reads[i]!.createdAt.getTime()).toBeGreaterThanOrEqual(reads[i - 1]!.createdAt.getTime())
      }

      // No mutation surface: the whole API only exposes GET/PUT on /v1/profile — there
      // is no route anywhere that could update or delete an audit row.
      const deleteAttempt = await app.inject({ method: 'DELETE', url: '/v1/profile', headers: { cookie } })
      expect(deleteAttempt.statusCode).toBe(404)
    })

    it('REQ-004.4 isolation: userB’s audit entries are never returned when scoped to userA', async () => {
      const putA = await app.inject({ method: 'PUT', url: '/v1/profile', payload: VALID_PAYLOAD })
      const cookieA = extractSessionCookie(putA.headers['set-cookie'])!
      const userIdA = userIdFromCookie(cookieA)

      const userBPayload = { ...VALID_PAYLOAD, firstName: 'Jonas', steuerId: '65929970489' }
      const putB = await app.inject({ method: 'PUT', url: '/v1/profile', payload: userBPayload })
      const cookieB = extractSessionCookie(putB.headers['set-cookie'])!
      const userIdB = userIdFromCookie(cookieB)

      await app.inject({ method: 'GET', url: '/v1/profile', headers: { cookie: cookieA } })
      await app.inject({ method: 'GET', url: '/v1/profile', headers: { cookie: cookieB } })

      const rowsA = await auditRows(prisma, userIdA)
      const rowsB = await auditRows(prisma, userIdB)

      expect(rowsA.length).toBeGreaterThan(0)
      expect(rowsB.length).toBeGreaterThan(0)
      expect(rowsA.every((row) => row.userId === userIdA)).toBe(true)
      expect(rowsA.some((row) => row.userId === userIdB)).toBe(false)
    })

    it('REQ-004.5 no sensitive value: the audit table never stores the plaintext or ciphertext Steuer-ID', async () => {
      const put = await app.inject({ method: 'PUT', url: '/v1/profile', payload: VALID_PAYLOAD })
      const cookie = extractSessionCookie(put.headers['set-cookie'])!
      const userId = userIdFromCookie(cookie)

      const rawSteuerIdAtRest = await rawProfileColumn(prisma, userId, 'steuerId')
      const rows = await auditRows(prisma, userId)
      expect(rows.length).toBeGreaterThan(0)

      const serializedRows = JSON.stringify(rows)
      expect(serializedRows).not.toContain(VALID_PAYLOAD.steuerId)
      if (rawSteuerIdAtRest) {
        expect(serializedRows).not.toContain(rawSteuerIdAtRest)
      }

      // The row shape itself carries no value column at all — only who/what/when.
      const columns = await prisma.$queryRaw<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns WHERE table_name = 'TaxDataAccessLog'
      `
      expect(columns.map((c) => c.column_name).sort()).toEqual(
        ['action', 'createdAt', 'id', 'resource', 'userId'].sort(),
      )
    })

    it('REQ-004.6 failure writes nothing: a 400 invalid payload appends zero audit entries', async () => {
      const before = await app.inject({ method: 'GET', url: '/v1/profile' })
      const cookie = extractSessionCookie(before.headers['set-cookie'])!
      const userId = userIdFromCookie(cookie)

      const response = await app.inject({
        method: 'PUT',
        url: '/v1/profile',
        payload: { ...VALID_PAYLOAD, steuerId: '1234567890' },
        headers: { cookie },
      })
      expect(response.statusCode).toBe(400)

      const writes = (await auditRows(prisma, userId)).filter((row) => row.action === 'WRITE')
      expect(writes).toHaveLength(0)
    })
  })
})
