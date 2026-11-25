// #450 5C / D7 — the test unlock: a fake payment provider that only exists outside production and
// only with PAYMENT_FAKE_PROVIDER=1. It replaces Stripe in CI, where no Stripe keys exist.
import { describe, expect, it } from 'vitest'
import { FAKE_PAYMENT_SIGNATURE, FakePaymentProvider, resolvePaymentProvider } from '../src/unlock/fake-payment-provider.js'
import { StripePaymentProvider } from '../src/unlock/stripe-payment-provider.js'

describe('resolvePaymentProvider', () => {
  it('is null without Stripe keys and without the flag (the honest "not available" state)', () => {
    expect(resolvePaymentProvider({} as NodeJS.ProcessEnv)).toBeNull()
  })

  it('uses the fake provider with PAYMENT_FAKE_PROVIDER=1 outside production', () => {
    expect(resolvePaymentProvider({ PAYMENT_FAKE_PROVIDER: '1' } as NodeJS.ProcessEnv)).toBeInstanceOf(FakePaymentProvider)
    expect(resolvePaymentProvider({ PAYMENT_FAKE_PROVIDER: 'true', NODE_ENV: 'test' } as NodeJS.ProcessEnv)).toBeInstanceOf(FakePaymentProvider)
  })

  it('refuses to start in production with the flag set — it would unlock the printout for free', () => {
    expect(() => resolvePaymentProvider({ PAYMENT_FAKE_PROVIDER: '1', NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toThrow(/production/)
  })

  it('real Stripe keys win over the flag', () => {
    const env = { PAYMENT_FAKE_PROVIDER: '1', STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_x', STRIPE_PRICE_ID: 'price_x' } as NodeJS.ProcessEnv
    expect(resolvePaymentProvider(env)).toBeInstanceOf(StripePaymentProvider)
  })
})

describe('FakePaymentProvider', () => {
  const provider = new FakePaymentProvider()

  it('sends the buyer straight back to the success URL, like a paid checkout would', async () => {
    const session = await provider.createCheckout({ userId: 'u', taxYear: 2026, successUrl: 'http://web/ok', cancelUrl: 'http://web/cancel' })
    expect(session.url).toBe('http://web/ok')
    expect(session.id).toMatch(/^fake_cs_/)
  })

  it('accepts only its own signature; a paid event carries the session id', async () => {
    const body = Buffer.from(JSON.stringify({ sessionId: 'fake_cs_1' }))
    await expect(provider.verifyEvent(body, FAKE_PAYMENT_SIGNATURE)).resolves.toEqual({ kind: 'bezahlt', sessionId: 'fake_cs_1', amountCents: null })
    await expect(provider.verifyEvent(body, 'wrong')).rejects.toThrow()
    await expect(provider.verifyEvent(Buffer.from('not json'), FAKE_PAYMENT_SIGNATURE)).rejects.toThrow()
  })

  it('a refund event takes the session back (API-4)', async () => {
    const body = Buffer.from(JSON.stringify({ sessionId: 'fake_cs_1', kind: 'erstattet' }))
    await expect(provider.verifyEvent(body, FAKE_PAYMENT_SIGNATURE)).resolves.toEqual({ kind: 'zurueckgenommen', sessionId: 'fake_cs_1', reason: 'erstattet' })
  })

  it('reuses a session by idempotency key, keeps it open for lookup and names a test price', async () => {
    const request = { userId: 'u', taxYear: 2026, successUrl: 'http://web/ok', cancelUrl: 'http://web/cancel', idempotencyKey: 'k1' }
    const first = await provider.createCheckout(request)
    await expect(provider.createCheckout(request)).resolves.toEqual(first)
    await expect(provider.lookupCheckout(first.id)).resolves.toEqual({ state: 'open', url: 'http://web/ok' })
    await expect(provider.lookupCheckout('fake_cs_unknown')).resolves.toEqual({ state: 'closed' })
    await expect(provider.priceOf('standard')).resolves.toEqual({ amountCents: 3499, currency: 'eur' })
  })
})
