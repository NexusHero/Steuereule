// ADR-0050 — the paid unlock end to end against the real server and Postgres: a
// Stripe-signed webhook over real HTTP flips the stored unlock to "bezahlt". This is
// the proof that the raw body survives Nest/Fastify parsing in the real boot path —
// the classic way webhook verification breaks in production while unit tests pass.
// Checkout creation itself calls Stripe's API and is not exercised here (no network
// in CI); the open row it would write is seeded directly instead.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { PrismaClient } from '@prisma/client'
import Stripe from 'stripe'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

const WEBHOOK_SECRET = 'whsec_acceptance_only'
process.env.STRIPE_SECRET_KEY = 'sk_test_acceptance_only'
process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET
process.env.STRIPE_PRICE_ID = 'price_acceptance_only'

describe('Freischaltung — Stripe webhook against the real server (ADR-0050)', () => {
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
    await prisma.freischaltung.deleteMany()
    await prisma.user.deleteMany({ where: { email: { startsWith: 'freischaltung-' } } })
  })

  afterAll(async () => {
    await app.close()
  })

  async function seedOpenUnlock(): Promise<string> {
    const user = await prisma.user.create({ data: { name: 'Test', email: `freischaltung-${Date.now()}@example.com` } })
    await prisma.freischaltung.create({
      data: { userId: user.id, steuerjahr: 2025, stripeCheckoutSessionId: 'cs_acceptance_1' },
    })
    return user.id
  }

  function postWebhook(body: string, signature: string): Promise<Response> {
    return fetch(`${baseUrl}/v1/zahlung/stripe/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': signature },
      body,
    })
  }

  const paidEvent = JSON.stringify({
    id: 'evt_acceptance',
    object: 'event',
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_acceptance_1', object: 'checkout.session', payment_status: 'paid', amount_total: 1999 } },
  })

  it('a correctly signed paid event unlocks the tax year', async () => {
    const userId = await seedOpenUnlock()
    const signature = new Stripe('sk_test').webhooks.generateTestHeaderString({ payload: paidEvent, secret: WEBHOOK_SECRET })

    const response = await postWebhook(paidEvent, signature)

    expect(response.status).toBe(200)
    const row = await prisma.freischaltung.findFirstOrThrow({ where: { userId } })
    expect(row).toMatchObject({ status: 'bezahlt', betragCent: 1999 })
    expect(row.bezahltAm).not.toBeNull()
  })

  it('a forged signature is refused with 401 and unlocks nothing', async () => {
    const userId = await seedOpenUnlock()
    const forged = new Stripe('sk_test').webhooks.generateTestHeaderString({ payload: paidEvent, secret: 'whsec_attacker' })

    const response = await postWebhook(paidEvent, forged)

    expect(response.status).toBe(401)
    expect(await prisma.freischaltung.findFirstOrThrow({ where: { userId } })).toMatchObject({ status: 'offen' })
  })

  it('the unlock cascades away with the account (Art. 17)', async () => {
    const userId = await seedOpenUnlock()
    await prisma.user.delete({ where: { id: userId } })
    expect(await prisma.freischaltung.count({ where: { userId } })).toBe(0)
  })
})
