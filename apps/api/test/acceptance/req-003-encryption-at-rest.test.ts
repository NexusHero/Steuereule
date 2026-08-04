// REQ-003 — Steuer-ID/Steuernummer field-encrypted at rest (ADR-0008). Real Postgres,
// real HTTP against the actual `buildApp()` boot from src/main.ts (never `.inject()`).
//
// Raises `test/profile.integration.test.ts`'s REQ-003 clauses from `green (integration)`
// to `green (acceptance)` — #167, Musti's #249 R2 ruling: a real dependency (Postgres)
// plus `.inject()` transport is not the acceptance tier the register's `Done` binds to.
// `test/profile.integration.test.ts` stays as-is (still-valid integration-tier proof,
// still cited under REQ-003); this file proves the same clauses over a real socket.
//
// The ciphertext-at-rest and tamper-integrity clauses read/write raw SQL directly
// against Postgres — that IS the "real dependency" half of the acceptance tier, not a
// stand-in for the API surface: every write and the read-back that recovers the userId
// go through the real HTTP boundary (`fetch`, real socket) first.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { resolveGuestSessionSecret, verifyGuestSession } from '../../src/auth/guest-session.js'

process.env.GUEST_SESSION_SECRET = 'req-003-secret'
process.env.BETTER_AUTH_SECRET = 'req-003-better-auth-secret-0123456789'
process.env.BETTER_AUTH_URL = 'http://127.0.0.1:39993'
process.env.CORS_ALLOWED_ORIGINS = 'https://allowed.example.com'

const VALID_PAYLOAD = {
  firstName: 'Anna',
  lastName: 'Beispiel',
  steuerId: '02476291358',
  steuernummer: '18181508155',
}

/** Recovers the trusted userId the app minted, from a real Set-Cookie response header. */
function userIdFromSetCookie(setCookieHeader: string | null): string {
  const cookie = setCookieHeader!.split(';')[0]!
  const rawValue = cookie.slice(cookie.indexOf('=') + 1)
  const userId = verifyGuestSession(decodeURIComponent(rawValue), resolveGuestSessionSecret())
  if (!userId) throw new Error('test harness: could not recover userId from the real Set-Cookie header')
  return userId
}

/** Raw-SQL read of a Profile column, bypassing the field-encryption client extension entirely. */
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

describe('REQ-003 — encrypted profile persistence at rest, against the real server', () => {
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
    await prisma.profile.deleteMany()
    await prisma.$executeRawUnsafe(`DELETE FROM "TaxDataAccessLog"`)
  })

  afterAll(async () => {
    await app.close()
  })

  it('REQ-003.1 round-trip: a real PUT then GET over HTTP returns the same Steuer-ID in plaintext', async () => {
    const put = await fetch(`${baseUrl}/v1/profile`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(VALID_PAYLOAD),
    })
    expect(put.status).toBe(200)
    const cookie = put.headers.get('set-cookie')!.split(';')[0]!

    const get = await fetch(`${baseUrl}/v1/profile`, { headers: { cookie } })
    expect(await get.json()).toEqual(VALID_PAYLOAD)
  })

  it('REQ-003.2 ciphertext at rest: a raw-SQL read of steuerId/steuernummer after a real HTTP PUT is not the input plaintext', async () => {
    const put = await fetch(`${baseUrl}/v1/profile`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(VALID_PAYLOAD),
    })
    expect(put.status).toBe(200)
    const userId = userIdFromSetCookie(put.headers.get('set-cookie'))

    const rawSteuerId = await rawProfileColumn(prisma, userId, 'steuerId')
    const rawSteuernummer = await rawProfileColumn(prisma, userId, 'steuernummer')

    expect(rawSteuerId).not.toBeNull()
    expect(rawSteuerId).not.toBe(VALID_PAYLOAD.steuerId)
    expect(rawSteuerId!.length).toBeGreaterThan(VALID_PAYLOAD.steuerId.length)
    // prisma-field-encryption's cloak envelope: "<envelopeVersion>.aesgcm256.<fingerprint>.<iv>.<ciphertext>"
    expect(rawSteuerId).toMatch(/^v\d+\.aesgcm256\./)

    expect(rawSteuernummer).not.toBeNull()
    expect(rawSteuernummer).not.toBe(VALID_PAYLOAD.steuernummer)
    expect(rawSteuernummer).toMatch(/^v\d+\.aesgcm256\./)
  })

  it('REQ-003.3 randomized: two accounts with the same Steuer-ID have different ciphertext at rest', async () => {
    const sameSteuerId = VALID_PAYLOAD.steuerId

    const putA = await fetch(`${baseUrl}/v1/profile`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...VALID_PAYLOAD, steuerId: sameSteuerId }),
    })
    const userIdA = userIdFromSetCookie(putA.headers.get('set-cookie'))

    const putB = await fetch(`${baseUrl}/v1/profile`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...VALID_PAYLOAD, firstName: 'Jonas', steuerId: sameSteuerId }),
    })
    const userIdB = userIdFromSetCookie(putB.headers.get('set-cookie'))

    const ciphertextA = await rawProfileColumn(prisma, userIdA, 'steuerId')
    const ciphertextB = await rawProfileColumn(prisma, userIdB, 'steuerId')

    expect(ciphertextA).not.toBeNull()
    expect(ciphertextB).not.toBeNull()
    // Same plaintext, different ciphertext — a fresh random IV per write.
    expect(ciphertextA).not.toBe(ciphertextB)
  })

  it('REQ-003.4 cross-userId isolation: userB’s real HTTP GET never sees userA’s row, userB’s PUT never overwrites userA', async () => {
    const putA = await fetch(`${baseUrl}/v1/profile`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(VALID_PAYLOAD),
    })
    const cookieA = putA.headers.get('set-cookie')!.split(';')[0]!

    const getB = await fetch(`${baseUrl}/v1/profile`)
    expect(await getB.json()).toEqual({ firstName: null, lastName: null, steuerId: null, steuernummer: null })

    const userBPayload = { ...VALID_PAYLOAD, firstName: 'Jonas', steuerId: '65929970489' }
    await fetch(`${baseUrl}/v1/profile`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(userBPayload),
    })

    const getA = await fetch(`${baseUrl}/v1/profile`, { headers: { cookie: cookieA } })
    expect(await getA.json()).toEqual(VALID_PAYLOAD)

    await expect(prisma.profile.count()).resolves.toBe(2)
  })

  it('REQ-003.5 tamper -> integrity: a corrupted ciphertext at rest makes a real GET fail loudly, never returns garbage or null', async () => {
    const put = await fetch(`${baseUrl}/v1/profile`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(VALID_PAYLOAD),
    })
    const cookie = put.headers.get('set-cookie')!.split(';')[0]!
    const userId = userIdFromSetCookie(put.headers.get('set-cookie'))

    await prisma.$executeRaw`
      UPDATE "Profile" SET "steuerId" = 'tampered-not-a-real-ciphertext-envelope' WHERE "userId" = ${userId}
    `

    const get = await fetch(`${baseUrl}/v1/profile`, { headers: { cookie } })

    // Must fail loudly (a non-200 error status) — an authenticated-cipher integrity
    // failure, never a silent 200 with the tampered value or a null steuerId.
    expect(get.status).not.toBe(200)
  })
})
