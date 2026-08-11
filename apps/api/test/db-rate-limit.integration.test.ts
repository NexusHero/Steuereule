// The shared DB-backed rate-limit algorithm (#238 task 2), extracted from
// verify-password-rate-limit.ts — real Postgres, since it's a real RateLimit-table
// read/write algorithm, not pure logic.
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { consumeDbRateLimit, peekDbRateLimit, resetDbRateLimit } from '../src/auth/db-rate-limit.js'

describe('consumeDbRateLimit', () => {
  let prisma: PrismaClient

  beforeAll(() => {
    prisma = new PrismaClient()
  })

  afterEach(async () => {
    await prisma.rateLimit.deleteMany({ where: { key: { startsWith: 'db-rate-limit-test:' } } })
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('allows up to `max` attempts inside the window, then blocks the next one', async () => {
    const key = 'db-rate-limit-test:basic'
    const now = Date.now()
    for (let i = 0; i < 3; i++) {
      await expect(consumeDbRateLimit(prisma, key, { windowMs: 60_000, max: 3 }, now + i)).resolves.toBe(true)
    }
    await expect(consumeDbRateLimit(prisma, key, { windowMs: 60_000, max: 3 }, now + 3)).resolves.toBe(false)
  })

  it('resets once the window has elapsed — a later attempt is allowed again', async () => {
    const key = 'db-rate-limit-test:window-reset'
    const now = Date.now()
    for (let i = 0; i < 3; i++) {
      await expect(consumeDbRateLimit(prisma, key, { windowMs: 1_000, max: 3 }, now + i)).resolves.toBe(true)
    }
    await expect(consumeDbRateLimit(prisma, key, { windowMs: 1_000, max: 3 }, now + 3)).resolves.toBe(false)
    // Past the window — the block lifts.
    await expect(consumeDbRateLimit(prisma, key, { windowMs: 1_000, max: 3 }, now + 2_000)).resolves.toBe(true)
  })

  it('keys are independent — exhausting one key never blocks another', async () => {
    const now = Date.now()
    for (let i = 0; i < 3; i++) {
      await consumeDbRateLimit(prisma, 'db-rate-limit-test:key-a', { windowMs: 60_000, max: 3 }, now + i)
    }
    await expect(consumeDbRateLimit(prisma, 'db-rate-limit-test:key-a', { windowMs: 60_000, max: 3 }, now + 3)).resolves.toBe(false)
    await expect(consumeDbRateLimit(prisma, 'db-rate-limit-test:key-b', { windowMs: 60_000, max: 3 }, now + 3)).resolves.toBe(true)
  })
})

// #339 review (Musti, blocking finding 1) — split out of consumeDbRateLimit so
// login-rate-limit.ts can decide "allowed?" (peek, read-only) before it knows the
// outcome, and "count this failure"/"clear on success" (consume/reset) once it does.
describe('peekDbRateLimit', () => {
  let prisma: PrismaClient

  beforeAll(() => {
    prisma = new PrismaClient()
  })

  afterEach(async () => {
    await prisma.rateLimit.deleteMany({ where: { key: { startsWith: 'db-rate-limit-test:' } } })
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('allows a key with no row at all, and does not create one', async () => {
    const key = 'db-rate-limit-test:peek-no-row'
    await expect(peekDbRateLimit(prisma, key, { windowMs: 60_000, max: 3 })).resolves.toBe(true)
    await expect(prisma.rateLimit.findFirst({ where: { key } })).resolves.toBeNull()
  })

  it('allows while under max, blocks at/over max — without moving the count', async () => {
    const key = 'db-rate-limit-test:peek-under-over'
    const now = Date.now()
    for (let i = 0; i < 3; i++) {
      await consumeDbRateLimit(prisma, key, { windowMs: 60_000, max: 3 }, now + i)
    }
    const row = await prisma.rateLimit.findFirst({ where: { key } })
    await expect(peekDbRateLimit(prisma, key, { windowMs: 60_000, max: 3 }, now + 4)).resolves.toBe(false)
    // A read-only check must not itself count as an attempt.
    await expect(prisma.rateLimit.findFirst({ where: { key } })).resolves.toMatchObject({ count: row?.count })
  })

  it('allows again once the window has elapsed, same as consumeDbRateLimit', async () => {
    const key = 'db-rate-limit-test:peek-window-reset'
    const now = Date.now()
    for (let i = 0; i < 3; i++) {
      await consumeDbRateLimit(prisma, key, { windowMs: 1_000, max: 3 }, now + i)
    }
    await expect(peekDbRateLimit(prisma, key, { windowMs: 1_000, max: 3 }, now + 3)).resolves.toBe(false)
    await expect(peekDbRateLimit(prisma, key, { windowMs: 1_000, max: 3 }, now + 2_000)).resolves.toBe(true)
  })
})

describe('resetDbRateLimit', () => {
  let prisma: PrismaClient

  beforeAll(() => {
    prisma = new PrismaClient()
  })

  afterEach(async () => {
    await prisma.rateLimit.deleteMany({ where: { key: { startsWith: 'db-rate-limit-test:' } } })
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('deletes an existing key outright — a fresh attempt afterward starts a clean window', async () => {
    const key = 'db-rate-limit-test:reset-existing'
    const now = Date.now()
    for (let i = 0; i < 3; i++) {
      await consumeDbRateLimit(prisma, key, { windowMs: 60_000, max: 3 }, now + i)
    }
    await expect(prisma.rateLimit.findFirst({ where: { key } })).resolves.not.toBeNull()

    await resetDbRateLimit(prisma, key)

    await expect(prisma.rateLimit.findFirst({ where: { key } })).resolves.toBeNull()
    await expect(consumeDbRateLimit(prisma, key, { windowMs: 60_000, max: 1 }, now + 100)).resolves.toBe(true)
  })

  it('is a no-op when the key has no row', async () => {
    await expect(resetDbRateLimit(prisma, 'db-rate-limit-test:reset-absent')).resolves.toBeUndefined()
  })
})
