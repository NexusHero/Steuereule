// ADR-0050 — the paid unlock per tax year, against an in-memory repository and a fake
// provider. Signature verification itself is proven with real Stripe signatures in
// stripe-payment-provider.test.ts; here the fake decides what "verified" means.
import { beforeEach, describe, expect, it } from 'vitest'
import { PAYMENT_RETURN_PARAM } from '@steuereule/core'
import { UnlockService } from '../src/unlock/unlock.service.js'
import type { CheckoutLookup, CheckoutRequest, PaymentProvider, PaymentEvent, Price } from '../src/unlock/payment-provider.js'
import { FakeUnlockRepository } from './fakes/fake-unlock.repository.js'

class FakeProvider implements PaymentProvider {
  requests: CheckoutRequest[] = []
  nextEvent: PaymentEvent | 'ungueltig' = { kind: 'ignoriert' }
  /** What a lookup of a session says; open with its URL unless a test says otherwise. */
  lookups = new Map<string, CheckoutLookup>()
  price: Price | null = { amountCents: 3499, currency: 'eur' }
  private readonly byKey = new Map<string, { id: string; url: string }>()

  async createCheckout(request: CheckoutRequest) {
    this.requests.push(request)
    const known = request.idempotencyKey ? this.byKey.get(request.idempotencyKey) : undefined
    if (known) return known
    const n = this.byKey.size + 1
    const session = { id: `cs_${n}`, url: `https://checkout.example/cs_${n}` }
    if (request.idempotencyKey) this.byKey.set(request.idempotencyKey, session)
    this.lookups.set(session.id, { state: 'open', url: session.url })
    return session
  }

  async lookupCheckout(sessionId: string): Promise<CheckoutLookup> {
    return this.lookups.get(sessionId) ?? { state: 'closed' }
  }

  async priceOf() {
    return this.price
  }

  async verifyEvent(): Promise<PaymentEvent> {
    if (this.nextEvent === 'ungueltig') throw new Error('No signatures found matching the expected signature')
    return this.nextEvent
  }
}

describe('UnlockService', () => {
  let repository: FakeUnlockRepository
  let provider: FakeProvider
  let service: UnlockService

  beforeEach(() => {
    repository = new FakeUnlockRepository()
    provider = new FakeProvider()
    service = new UnlockService(repository, provider, 'https://app.steuereule.de')
  })

  async function pay(sessionId = 'cs_1') {
    provider.nextEvent = { kind: 'bezahlt', sessionId, amountCents: 3499 }
    await service.processWebhook(Buffer.from('{}'), 'sig')
  }

  it('a fresh tax year is payable, not unlocked', async () => {
    await expect(service.status('u1', 2025)).resolves.toBe('offen')
  })

  it('checkout records an open unlock and returns the hosted page, with return URLs in the shared contract', async () => {
    const { checkoutUrl } = await service.startCheckout('u1', 2025)

    expect(checkoutUrl).toBe('https://checkout.example/cs_1')
    expect(repository.rows).toMatchObject([{ userId: 'u1', taxYear: 2025, sessionId: 'cs_1', status: 'offen', amountCents: null }])
    const success = new URL(provider.requests[0]!.successUrl)
    const cancel = new URL(provider.requests[0]!.cancelUrl)
    expect(success.pathname).toBe('/app/steuerjahr/2025/ausdruck')
    // WEB-1: the app reads exactly this parameter and these values.
    expect(success.searchParams.get(PAYMENT_RETURN_PARAM)).toBe('erfolg')
    expect(cancel.searchParams.get(PAYMENT_RETURN_PARAM)).toBe('abbruch')
    await expect(service.status('u1', 2025)).resolves.toBe('offen')
  })

  it('only a verified "bezahlt" event unlocks — for that user and that tax year only', async () => {
    await service.startCheckout('u1', 2025)
    await pay()

    await expect(service.status('u1', 2025)).resolves.toBe('freigeschaltet')
    await expect(service.status('u1', 2024)).resolves.toBe('offen')
    await expect(service.status('u2', 2025)).resolves.toBe('offen')
    expect(repository.rows[0]!.amountCents).toBe(3499)
  })

  it('a webhook redelivery is idempotent', async () => {
    await service.startCheckout('u1', 2025)
    await pay()
    await pay()
    expect(repository.rows.filter((row) => row.status === 'bezahlt')).toHaveLength(1)
  })

  it('an unverifiable payload is rejected and unlocks nothing', async () => {
    await service.startCheckout('u1', 2025)
    provider.nextEvent = 'ungueltig'
    await expect(service.processWebhook(Buffer.from('{}'), 'forged')).rejects.toMatchObject({ code: 'WEBHOOK_SIGNATURE_INVALID' })
    await expect(service.status('u1', 2025)).resolves.toBe('offen')
  })

  it('a missing signature or raw body is rejected before the provider is asked', async () => {
    await expect(service.processWebhook(undefined, 'sig')).rejects.toMatchObject({ code: 'WEBHOOK_SIGNATURE_MISSING' })
    await expect(service.processWebhook(Buffer.from('{}'), undefined)).rejects.toMatchObject({ code: 'WEBHOOK_SIGNATURE_MISSING' })
  })

  it('without a configured provider the state is honestly "nicht-verfuegbar" and checkout refuses', async () => {
    const without = new UnlockService(repository, null, 'https://app.steuereule.de')
    await expect(without.status('u1', 2025)).resolves.toBe('nicht-verfuegbar')
    await expect(without.startCheckout('u1', 2025)).rejects.toMatchObject({ code: 'PAYMENT_NOT_CONFIGURED' })
  })

  describe('API-4: no second payment, no payment without a record', () => {
    it('refuses a checkout for a year that is already paid', async () => {
      await service.startCheckout('u1', 2025)
      await pay()
      await expect(service.startCheckout('u1', 2025)).rejects.toMatchObject({ code: 'ALREADY_PAID' })
      expect(provider.requests).toHaveLength(1)
    })

    it('reuses the open session instead of creating another', async () => {
      const first = await service.startCheckout('u1', 2025)
      const second = await service.startCheckout('u1', 2025)
      expect(second.checkoutUrl).toBe(first.checkoutUrl)
      expect(provider.requests).toHaveLength(1)
      expect(repository.rows).toHaveLength(1)
    })

    it('a session paid before its webhook arrived is reconciled and not sold again', async () => {
      await service.startCheckout('u1', 2025)
      provider.lookups.set('cs_1', { state: 'paid', amountCents: 3499 })
      await expect(service.startCheckout('u1', 2025)).rejects.toMatchObject({ code: 'ALREADY_PAID' })
      await expect(service.status('u1', 2025)).resolves.toBe('freigeschaltet')
    })

    it('a session whose asynchronous payment is pending is not sold again', async () => {
      await service.startCheckout('u1', 2025)
      provider.lookups.set('cs_1', { state: 'pending' })
      await expect(service.startCheckout('u1', 2025)).rejects.toMatchObject({ code: 'PAYMENT_PENDING' })
      expect(provider.requests).toHaveLength(1)
    })

    it('a closed session is set aside and a new one is created', async () => {
      await service.startCheckout('u1', 2025)
      provider.lookups.set('cs_1', { state: 'closed' })
      const next = await service.startCheckout('u1', 2025)
      expect(next.checkoutUrl).toBe('https://checkout.example/cs_2')
      expect(repository.rows.map((row) => row.status)).toEqual(['abgelaufen', 'offen'])
      // Different attempts, different idempotency keys.
      expect(provider.requests[0]!.idempotencyKey).not.toBe(provider.requests[1]!.idempotencyKey)
    })

    it('two tabs starting at once get the same session (one idempotency key per attempt)', async () => {
      const [a, b] = await Promise.all([service.startCheckout('u1', 2025), service.startCheckout('u1', 2025)])
      expect(a.checkoutUrl).toBe(b.checkoutUrl)
      expect(repository.rows).toHaveLength(1)
    })

    it('a failed local write after the session exists: the retry gets the same session and records it', async () => {
      repository.failNextCreate = true
      await expect(service.startCheckout('u1', 2025)).rejects.toThrow()
      const retry = await service.startCheckout('u1', 2025)
      expect(retry.checkoutUrl).toBe('https://checkout.example/cs_1')
      expect(repository.rows).toHaveLength(1)
    })

    it('a paid event for a session without a local row rebuilds the row from the session owner', async () => {
      provider.nextEvent = { kind: 'bezahlt', sessionId: 'cs_lost', amountCents: 3499, owner: { userId: 'u1', taxYear: 2025, tier: 'standard' } }
      await service.processWebhook(Buffer.from('{}'), 'sig')
      await expect(service.status('u1', 2025)).resolves.toBe('freigeschaltet')
    })

    it('a refund takes the unlock back; a redelivery changes nothing more', async () => {
      await service.startCheckout('u1', 2025)
      await pay()
      provider.nextEvent = { kind: 'zurueckgenommen', sessionId: 'cs_1', reason: 'erstattet' }
      await service.processWebhook(Buffer.from('{}'), 'sig')
      await service.processWebhook(Buffer.from('{}'), 'sig')
      await expect(service.status('u1', 2025)).resolves.toBe('offen')
      expect(repository.rows[0]!.status).toBe('erstattet')
      // The old "paid" event redelivered does not bring it back.
      await pay()
      await expect(service.status('u1', 2025)).resolves.toBe('offen')
    })

    it('a dispute takes the unlock back; a dispute won returns it', async () => {
      await service.startCheckout('u1', 2025)
      await pay()
      provider.nextEvent = { kind: 'zurueckgenommen', sessionId: 'cs_1', reason: 'angefochten' }
      await service.processWebhook(Buffer.from('{}'), 'sig')
      await expect(service.status('u1', 2025)).resolves.toBe('offen')
      provider.nextEvent = { kind: 'wiederhergestellt', sessionId: 'cs_1' }
      await service.processWebhook(Buffer.from('{}'), 'sig')
      await expect(service.status('u1', 2025)).resolves.toBe('freigeschaltet')
    })
  })

  describe('the provider delivers events in any order and more than once', () => {
    const owner = { userId: 'u1', taxYear: 2025, tier: 'standard' as const }
    const send = async (event: PaymentEvent) => {
      provider.nextEvent = event
      await service.processWebhook(Buffer.from('{}'), 'sig')
    }

    it('a refund that overtakes the completion event leaves the year locked', async () => {
      await service.startCheckout('u1', 2025)
      await send({ kind: 'zurueckgenommen', sessionId: 'cs_1', reason: 'erstattet' })
      await pay()
      await expect(service.status('u1', 2025)).resolves.toBe('offen')
      expect(repository.rows[0]!.status).toBe('erstattet')
    })

    it('a refund that overtakes the completion of a session without a local row is kept too', async () => {
      await send({ kind: 'zurueckgenommen', sessionId: 'cs_lost', reason: 'erstattet', owner })
      await send({ kind: 'bezahlt', sessionId: 'cs_lost', amountCents: 3499, owner })
      await expect(service.status('u1', 2025)).resolves.toBe('offen')
      expect(repository.rows.map((row) => row.status)).toEqual(['erstattet'])
    })

    it('a dispute that overtakes the completion event locks until it is won', async () => {
      await service.startCheckout('u1', 2025)
      await send({ kind: 'zurueckgenommen', sessionId: 'cs_1', reason: 'angefochten' })
      await pay()
      await expect(service.status('u1', 2025)).resolves.toBe('offen')
      await send({ kind: 'wiederhergestellt', sessionId: 'cs_1' })
      await expect(service.status('u1', 2025)).resolves.toBe('freigeschaltet')
    })

    it('a redelivered "dispute opened" after the dispute was won does not lock a paying customer out', async () => {
      await service.startCheckout('u1', 2025)
      await pay()
      await send({ kind: 'zurueckgenommen', sessionId: 'cs_1', reason: 'angefochten' })
      await send({ kind: 'wiederhergestellt', sessionId: 'cs_1' })
      await send({ kind: 'zurueckgenommen', sessionId: 'cs_1', reason: 'angefochten' })
      await expect(service.status('u1', 2025)).resolves.toBe('freigeschaltet')
    })

    it('a failed asynchronous payment closes the session, so a new attempt can start', async () => {
      await service.startCheckout('u1', 2025)
      provider.lookups.set('cs_1', { state: 'pending' })
      await expect(service.startCheckout('u1', 2025)).rejects.toMatchObject({ code: 'PAYMENT_PENDING' })
      await send({ kind: 'geschlossen', sessionId: 'cs_1' })
      await expect(service.startCheckout('u1', 2025)).resolves.toMatchObject({ checkoutUrl: expect.stringContaining('cs_2') })
    })
  })

  describe('WEB-16: the price before the redirect', () => {
    it('comes from the provider for the tier the checkout would charge', async () => {
      await expect(service.price('u1', 2025)).resolves.toEqual({ amountCents: 3499, currency: 'eur' })
    })

    it('is null when the provider cannot say, or when there is no provider', async () => {
      provider.price = null
      await expect(service.price('u1', 2025)).resolves.toBeNull()
      await expect(new UnlockService(repository, null, 'https://app').price('u1', 2025)).resolves.toBeNull()
    })
  })
})
