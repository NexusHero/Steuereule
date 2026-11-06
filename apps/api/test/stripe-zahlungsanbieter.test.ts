// The Stripe adapter's webhook half against real Stripe signatures: the SDK's own
// generateTestHeaderString signs offline, so this proves the verification without
// any network, and that a tampered body or wrong secret is refused.
import Stripe from 'stripe'
import { describe, expect, it } from 'vitest'
import { resolveStripeConfig, StripePaymentProvider } from '../src/freischaltung/stripe-zahlungsanbieter.js'

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
    data: { object: { id: 'cs_test_1', object: 'checkout.session', payment_status: paymentStatus, amount_total: 1999 } },
  }
}

describe('StripeZahlungsanbieter.verifiziereEreignis', () => {
  it('a correctly signed, paid checkout.session.completed is "bezahlt"', () => {
    const { body, signature } = signed(sessionEvent('checkout.session.completed', 'paid'))
    expect(provider.verifyEvent(body, signature)).toEqual({
      kind: 'bezahlt',
      sessionId: 'cs_test_1',
      amountCents: 1999,
    })
  })

  it('a completed but unpaid session (SEPA pending) is ignored until async_payment_succeeded', () => {
    const pending = signed(sessionEvent('checkout.session.completed', 'unpaid'))
    expect(provider.verifyEvent(pending.body, pending.signature)).toEqual({ kind: 'ignoriert' })

    const later = signed(sessionEvent('checkout.session.async_payment_succeeded', 'paid'))
    expect(provider.verifyEvent(later.body, later.signature)).toMatchObject({ kind: 'bezahlt' })
  })

  it('refuses a tampered body', () => {
    const { signature } = signed(sessionEvent('checkout.session.completed', 'paid'))
    const forged = Buffer.from(JSON.stringify(sessionEvent('checkout.session.completed', 'paid')).replace('1999', '1'))
    expect(() => provider.verifyEvent(forged, signature)).toThrow()
  })

  it('refuses a signature made with another secret', () => {
    const { body, signature } = signed(sessionEvent('checkout.session.completed', 'paid'), 'whsec_attacker')
    expect(() => provider.verifyEvent(body, signature)).toThrow()
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
