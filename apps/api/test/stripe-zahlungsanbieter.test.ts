// The Stripe adapter's webhook half against real Stripe signatures: the SDK's own
// generateTestHeaderString signs offline, so this proves the verification without
// any network, and that a tampered body or wrong secret is refused.
import Stripe from 'stripe'
import { describe, expect, it } from 'vitest'
import { resolveStripeConfig, StripeZahlungsanbieter } from '../src/freischaltung/stripe-zahlungsanbieter.js'

const config = { secretKey: 'sk_test_unit', webhookSecret: 'whsec_unit_test_secret', priceId: 'price_unit' }
const anbieter = new StripeZahlungsanbieter(config)

function signed(payload: object, secret = config.webhookSecret): { body: Buffer; signatur: string } {
  const body = JSON.stringify(payload)
  const signatur = new Stripe('sk_test_unit').webhooks.generateTestHeaderString({ payload: body, secret })
  return { body: Buffer.from(body), signatur }
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
    const { body, signatur } = signed(sessionEvent('checkout.session.completed', 'paid'))
    expect(anbieter.verifiziereEreignis(body, signatur)).toEqual({
      art: 'bezahlt',
      sitzungId: 'cs_test_1',
      betragCent: 1999,
    })
  })

  it('a completed but unpaid session (SEPA pending) is ignored until async_payment_succeeded', () => {
    const pending = signed(sessionEvent('checkout.session.completed', 'unpaid'))
    expect(anbieter.verifiziereEreignis(pending.body, pending.signatur)).toEqual({ art: 'ignoriert' })

    const later = signed(sessionEvent('checkout.session.async_payment_succeeded', 'paid'))
    expect(anbieter.verifiziereEreignis(later.body, later.signatur)).toMatchObject({ art: 'bezahlt' })
  })

  it('refuses a tampered body', () => {
    const { signatur } = signed(sessionEvent('checkout.session.completed', 'paid'))
    const forged = Buffer.from(JSON.stringify(sessionEvent('checkout.session.completed', 'paid')).replace('1999', '1'))
    expect(() => anbieter.verifiziereEreignis(forged, signatur)).toThrow()
  })

  it('refuses a signature made with another secret', () => {
    const { body, signatur } = signed(sessionEvent('checkout.session.completed', 'paid'), 'whsec_attacker')
    expect(() => anbieter.verifiziereEreignis(body, signatur)).toThrow()
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
