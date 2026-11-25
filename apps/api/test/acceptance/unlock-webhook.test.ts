// ADR-0050 — the paid unlock end to end against the real server and Postgres: a
// Stripe-signed webhook over real HTTP flips the stored unlock to "bezahlt". This is
// the proof that the raw body survives Nest/Fastify parsing in the real boot path —
// the classic way webhook verification breaks in production while unit tests pass.
// Checkout creation itself calls Stripe's API and is not exercised here (no network
// in CI); the open row it would write is seeded directly instead.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { PrismaClient } from '@prisma/client'
import Stripe from 'stripe'
import type { AccountDeletionRepository } from '../../src/account/account-deletion.repository.js'
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
    await prisma.legalHold.deleteMany({ where: { resource: 'unlock' } })
    await prisma.unlock.deleteMany()
    await prisma.user.deleteMany({ where: { email: { startsWith: 'freischaltung-' } } })
  })

  afterAll(async () => {
    await app.close()
  })

  async function seedOpenUnlock(): Promise<string> {
    const user = await prisma.user.create({ data: { name: 'Test', email: `freischaltung-${Date.now()}@example.com` } })
    await prisma.unlock.create({
      data: { userId: user.id, taxYear: 2025, stripeCheckoutSessionId: 'cs_acceptance_1' },
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
    const row = await prisma.unlock.findFirstOrThrow({ where: { userId } })
    expect(row).toMatchObject({ status: 'bezahlt', amountCents: 1999 })
    expect(row.paidAt).not.toBeNull()
  })

  it('a forged signature is refused with 401 and unlocks nothing', async () => {
    const userId = await seedOpenUnlock()
    const forged = new Stripe('sk_test').webhooks.generateTestHeaderString({ payload: paidEvent, secret: 'whsec_attacker' })

    const response = await postWebhook(paidEvent, forged)

    expect(response.status).toBe(401)
    expect(await prisma.unlock.findFirstOrThrow({ where: { userId } })).toMatchObject({ status: 'offen' })
  })

  it('API-4: a paid session whose local row was never written is rebuilt from the session metadata', async () => {
    const user = await prisma.user.create({ data: { name: 'Test', email: `freischaltung-${Date.now()}@example.com` } })
    const lostEvent = JSON.stringify({
      id: 'evt_acceptance_lost',
      object: 'event',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_acceptance_lost', object: 'checkout.session', payment_status: 'paid', amount_total: 1999, metadata: { userId: user.id, steuerjahr: '2025', stufe: 'standard' } } },
    })
    const signature = new Stripe('sk_test').webhooks.generateTestHeaderString({ payload: lostEvent, secret: WEBHOOK_SECRET })

    expect((await postWebhook(lostEvent, signature)).status).toBe(200)
    // Redelivered: still one row.
    expect((await postWebhook(lostEvent, signature)).status).toBe(200)

    const rows = await prisma.unlock.findMany({ where: { userId: user.id } })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ status: 'bezahlt', taxYear: 2025, tier: 'standard', stripeCheckoutSessionId: 'cs_acceptance_lost' })
  })

  // Art. 17 against § 147 AO (P7, stakeholder decision 2): the Unlock rows have no FK to User any more.
  // Deleting the account deletes a session that never paid; the one the webhook paid is a Buchungsbeleg and
  // stays, with the legal hold the webhook wrote, until the lifecycle sweep removes it when the hold ends.
  it('account deletion deletes an unpaid unlock and keeps the one the webhook paid under its legal hold (Art. 17, § 147 AO)', async () => {
    const userId = await seedOpenUnlock()
    await prisma.unlock.create({ data: { userId, taxYear: 2024, stripeCheckoutSessionId: 'cs_acceptance_unpaid' } })
    const signature = new Stripe('sk_test').webhooks.generateTestHeaderString({ payload: paidEvent, secret: WEBHOOK_SECRET })
    expect((await postWebhook(paidEvent, signature)).status).toBe(200)

    const { ACCOUNT_DELETION_REPOSITORY } = await import('../../src/account/account-deletion.repository.js')
    const deletion = app.get<AccountDeletionRepository>(ACCOUNT_DELETION_REPOSITORY)
    const result = await deletion.deleteAccount(userId)

    expect(await prisma.user.count({ where: { id: userId } })).toBe(0)
    expect((await prisma.unlock.findMany({ where: { userId } })).map((row) => row.stripeCheckoutSessionId)).toEqual(['cs_acceptance_1'])
    expect(result.legalHolds).toEqual([expect.objectContaining({ resource: 'unlock', count: 1, reason: '§ 147 AO, § 257 HGB' })])
    expect(await prisma.legalHold.count({ where: { userId, resource: 'unlock' } })).toBe(1)
  })
})
