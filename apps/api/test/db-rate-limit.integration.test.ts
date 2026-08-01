// The shared DB-backed rate-limit algorithm (#238 task 2), extracted from
// verify-password-rate-limit.ts — real Postgres, since it's a real RateLimit-table
// read/write algorithm, not pure logic.
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { consumeDbRateLimit } from '../src/auth/db-rate-limit.js'

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
