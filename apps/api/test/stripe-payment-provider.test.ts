// The Stripe adapter's webhook half against real Stripe signatures: the SDK's own
// generateTestHeaderString signs offline, so this proves the verification without
// any network, and that a tampered body or wrong secret is refused.
import Stripe from 'stripe'
import { describe, expect, it, vi } from 'vitest'
import { PaymentProviderUnavailableError } from '../src/unlock/payment-provider.js'
import { REVOCATION_NOTICE, resolveStripeConfig, StripePaymentProvider, type StripeClient } from '../src/unlock/stripe-payment-provider.js'

const config = { secretKey: 'sk_test_unit', webhookSecret: 'whsec_unit_test_secret', priceId: 'price_unit' }
const provider = new StripePaymentProvider(config)

function signed(payload: object, secret = config.webhookSecret): { body: Buffer; signature: string } {
  const body = JSON.stringify(payload)
  const signature = new Stripe('sk_test_unit').webhooks.generateTestHeaderString({ payload: body, secret })
  return { body: Buffer.from(body), signature }
}

function sessionEvent(type: string, paymentStatus: string) {
  return {
    id: 'evt_1',
    object: 'event',
    type,
    data: { object: { id: 'cs_test_1', object: 'checkout.session', payment_status: paymentStatus, amount_total: 1999, metadata: { userId: 'u1', steuerjahr: '2025', stufe: 'standard' } } },
  }
}

describe('StripeZahlungsanbieter.verifiziereEreignis', () => {
  it('a correctly signed, paid checkout.session.completed is "bezahlt", with the owner from its metadata', async () => {
    const { body, signature } = signed(sessionEvent('checkout.session.completed', 'paid'))
    await expect(provider.verifyEvent(body, signature)).resolves.toEqual({
      kind: 'bezahlt',
      sessionId: 'cs_test_1',
      amountCents: 1999,
      owner: { userId: 'u1', taxYear: 2025, tier: 'standard' },
    })
  })

  it('a completed but unpaid session (SEPA pending) is ignored until async_payment_succeeded', async () => {
    const pending = signed(sessionEvent('checkout.session.completed', 'unpaid'))
    await expect(provider.verifyEvent(pending.body, pending.signature)).resolves.toEqual({ kind: 'ignoriert' })

    const later = signed(sessionEvent('checkout.session.async_payment_succeeded', 'paid'))
    await expect(provider.verifyEvent(later.body, later.signature)).resolves.toMatchObject({ kind: 'bezahlt' })
  })

  it('a failed asynchronous payment closes the session', async () => {
    const failed = signed(sessionEvent('checkout.session.async_payment_failed', 'unpaid'))
    await expect(provider.verifyEvent(failed.body, failed.signature)).resolves.toMatchObject({ kind: 'geschlossen' })
  })

  it('refuses a tampered body', async () => {
    const { signature } = signed(sessionEvent('checkout.session.completed', 'paid'))
    const forged = Buffer.from(JSON.stringify(sessionEvent('checkout.session.completed', 'paid')).replace('1999', '1'))
    await expect(provider.verifyEvent(forged, signature)).rejects.toThrow()
  })

  it('refuses a signature made with another secret', async () => {
    const { body, signature } = signed(sessionEvent('checkout.session.completed', 'paid'), 'whsec_attacker')
    await expect(provider.verifyEvent(body, signature)).rejects.toThrow()
  })
})

/** A real SDK for the signature, with the network calls stubbed. */
function stubbed(overrides: { list?: ReturnType<typeof vi.fn>; retrieve?: ReturnType<typeof vi.fn>; price?: ReturnType<typeof vi.fn>; create?: ReturnType<typeof vi.fn> }) {
  const real = new Stripe('sk_test_unit')
  const client = {
    webhooks: real.webhooks,
    checkout: { sessions: { list: overrides.list ?? vi.fn(), retrieve: overrides.retrieve ?? vi.fn(), create: overrides.create ?? vi.fn() } },
    prices: { retrieve: overrides.price ?? vi.fn() },
  } as unknown as StripeClient
  return client
}

function chargeEvent(type: string, object: Record<string, unknown>) {
  return { id: 'evt_2', object: 'event', type, data: { object } }
}

describe('refunds and disputes take the unlock back (API-4)', () => {
  it('a refund names the owner from the session metadata, so it can be recorded before the completion event', async () => {
    const owned = vi.fn().mockResolvedValue({ data: [{ id: 'cs_test_1', metadata: { userId: 'u1', steuerjahr: '2025', stufe: 'standard' } }] })
    const { body, signature } = signed(chargeEvent('charge.refunded', { id: 'ch_1', object: 'charge', refunded: true, payment_intent: 'pi_1' }))
    await expect(new StripePaymentProvider(config, stubbed({ list: owned })).verifyEvent(body, signature)).resolves.toEqual({
      kind: 'zurueckgenommen',
      sessionId: 'cs_test_1',
      reason: 'erstattet',
      owner: { userId: 'u1', taxYear: 2025, tier: 'standard' },
    })
  })

  const list = vi.fn().mockResolvedValue({ data: [{ id: 'cs_test_1' }] })
  const withList = new StripePaymentProvider(config, stubbed({ list }))

  it('a full refund is "zurueckgenommen" for the session of its payment', async () => {
    const { body, signature } = signed(chargeEvent('charge.refunded', { id: 'ch_1', object: 'charge', refunded: true, payment_intent: 'pi_1' }))
    await expect(withList.verifyEvent(body, signature)).resolves.toEqual({ kind: 'zurueckgenommen', sessionId: 'cs_test_1', reason: 'erstattet' })
    expect(list).toHaveBeenCalledWith({ payment_intent: 'pi_1', limit: 1 })
  })

  it('a partial refund changes nothing', async () => {
    const { body, signature } = signed(chargeEvent('charge.refunded', { id: 'ch_1', object: 'charge', refunded: false, payment_intent: 'pi_1' }))
    await expect(withList.verifyEvent(body, signature)).resolves.toEqual({ kind: 'ignoriert' })
  })

  it('an opened dispute takes it back, a dispute won returns it, a lost one changes nothing more', async () => {
    const opened = signed(chargeEvent('charge.dispute.created', { id: 'dp_1', object: 'dispute', status: 'needs_response', payment_intent: 'pi_1' }))
    await expect(withList.verifyEvent(opened.body, opened.signature)).resolves.toEqual({ kind: 'zurueckgenommen', sessionId: 'cs_test_1', reason: 'angefochten' })
    const won = signed(chargeEvent('charge.dispute.closed', { id: 'dp_1', object: 'dispute', status: 'won', payment_intent: 'pi_1' }))
    await expect(withList.verifyEvent(won.body, won.signature)).resolves.toEqual({ kind: 'wiederhergestellt', sessionId: 'cs_test_1' })
    const lost = signed(chargeEvent('charge.dispute.closed', { id: 'dp_1', object: 'dispute', status: 'lost', payment_intent: 'pi_1' }))
    await expect(withList.verifyEvent(lost.body, lost.signature)).resolves.toEqual({ kind: 'ignoriert' })
  })

  it('a payment that is not one of our sessions is ignored', async () => {
    const none = new StripePaymentProvider(config, stubbed({ list: vi.fn().mockResolvedValue({ data: [] }) }))
    const { body, signature } = signed(chargeEvent('charge.refunded', { id: 'ch_1', object: 'charge', refunded: true, payment_intent: 'pi_other' }))
    await expect(none.verifyEvent(body, signature)).resolves.toEqual({ kind: 'ignoriert' })
  })

  it('Stripe unreachable while resolving the session: the event is redelivered, not dropped', async () => {
    const down = new StripePaymentProvider(config, stubbed({ list: vi.fn().mockRejectedValue(new Error('ECONNRESET')) }))
    const { body, signature } = signed(chargeEvent('charge.refunded', { id: 'ch_1', object: 'charge', refunded: true, payment_intent: 'pi_1' }))
    await expect(down.verifyEvent(body, signature)).rejects.toBeInstanceOf(PaymentProviderUnavailableError)
  })
})

describe('lookupCheckout, priceOf and the checkout request', () => {
  it('names what became of a session', async () => {
    const retrieve = vi.fn()
    const p = new StripePaymentProvider(config, stubbed({ retrieve }))
    retrieve.mockResolvedValueOnce({ status: 'open', url: 'https://checkout.stripe.com/x' })
    await expect(p.lookupCheckout('cs_1')).resolves.toEqual({ state: 'open', url: 'https://checkout.stripe.com/x' })
    retrieve.mockResolvedValueOnce({ status: 'complete', payment_status: 'paid', amount_total: 3499 })
    await expect(p.lookupCheckout('cs_1')).resolves.toEqual({ state: 'paid', amountCents: 3499 })
    retrieve.mockResolvedValueOnce({ status: 'complete', payment_status: 'unpaid', amount_total: 3499 })
    await expect(p.lookupCheckout('cs_1')).resolves.toEqual({ state: 'pending' })
    retrieve.mockResolvedValueOnce({ status: 'expired', url: null })
    await expect(p.lookupCheckout('cs_1')).resolves.toEqual({ state: 'closed' })
  })

  it('reads the price of the same price id the checkout charges, and caches it', async () => {
    const price = vi.fn().mockResolvedValue({ unit_amount: 3499, currency: 'eur' })
    const p = new StripePaymentProvider(config, stubbed({ price }))
    await expect(p.priceOf('standard')).resolves.toEqual({ amountCents: 3499, currency: 'eur' })
    await p.priceOf('standard')
    expect(price).toHaveBeenCalledTimes(1)
    expect(price).toHaveBeenCalledWith('price_unit')
    // No self-employment price configured: nothing to show.
    await expect(p.priceOf('selbststaendig')).resolves.toBeNull()
  })

  it('an unreadable price is null, not an error', async () => {
    const p = new StripePaymentProvider(config, stubbed({ price: vi.fn().mockRejectedValue(new Error('down')) }))
    await expect(p.priceOf('standard')).resolves.toBeNull()
  })

  it('sends the idempotency key and the withdrawal consent of the tier (H2-39)', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.com/x' })
    const p = new StripePaymentProvider({ ...config, priceIdSelfEmployed: 'price_se' }, stubbed({ create }))
    await p.createCheckout({ userId: 'u', taxYear: 2025, tier: 'selbststaendig', successUrl: 'https://a', cancelUrl: 'https://b', idempotencyKey: 'checkout:u:2025:selbststaendig:0' })
    const [params, options] = create.mock.calls[0]!
    expect(options).toEqual({ idempotencyKey: 'checkout:u:2025:selbststaendig:0' })
    expect(params.custom_text.terms_of_service_acceptance.message).toBe(REVOCATION_NOTICE.selbststaendig)
    expect(REVOCATION_NOTICE.selbststaendig).toMatch(/Ausfüllhilfe/)
    expect(REVOCATION_NOTICE.standard).toMatch(/Formular-Ausdrucks/)
    for (const text of Object.values(REVOCATION_NOTICE)) expect(text).not.toMatch(/\[|\]/)
  })
})

describe('resolveStripeConfig', () => {
  it('is undefined when nothing is set (payment honestly unavailable)', () => {
    expect(resolveStripeConfig({})).toBeUndefined()
  })

  it('refuses a partial configuration', () => {
    expect(() => resolveStripeConfig({ STRIPE_SECRET_KEY: 'sk' })).toThrow(/set together/)
  })

  it('returns all three values when set', () => {
    expect(
      resolveStripeConfig({ STRIPE_SECRET_KEY: 'sk', STRIPE_WEBHOOK_SECRET: 'wh', STRIPE_PRICE_ID: 'price' }),
    ).toEqual({ secretKey: 'sk', webhookSecret: 'wh', priceId: 'price' })
  })
})
