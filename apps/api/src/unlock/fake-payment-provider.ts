import { randomUUID } from 'node:crypto'
import type { CheckoutRequest, CheckoutSession, PaymentEvent, PaymentProvider } from './payment-provider.js'
import { resolveStripeConfig, StripePaymentProvider } from './stripe-payment-provider.js'

/** The only signature the fake provider's webhook accepts (#450 D7: test unlock, never in production). */
export const FAKE_PAYMENT_SIGNATURE = 'fake-payment-signature'

/**
 * Test replacement for Stripe (#450 5C, D7): "checkout" returns to the success URL at once and the
 * paid event is posted to the real webhook endpoint by the test, so the app, the unlock table and
 * the printout gate run unchanged. Selectable only with PAYMENT_FAKE_PROVIDER=1 outside production.
 */
export class FakePaymentProvider implements PaymentProvider {
  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    return { id: `fake_cs_${randomUUID()}`, url: request.successUrl }
  }

  verifyEvent(rawData: Buffer, signature: string): PaymentEvent {
    if (signature !== FAKE_PAYMENT_SIGNATURE) throw new Error('invalid fake payment signature')
    const parsed = JSON.parse(rawData.toString('utf8')) as { sessionId?: unknown }
    if (typeof parsed.sessionId !== 'string' || parsed.sessionId === '') throw new Error('the fake paid event needs a sessionId')
    return { kind: 'bezahlt', sessionId: parsed.sessionId, amountCents: null }
  }
}

/** Real Stripe when its keys are set, else the fake with the flag, else none (status "nicht-verfuegbar"). */
export function resolvePaymentProvider(env: NodeJS.ProcessEnv = process.env): PaymentProvider | null {
  const flag = env.PAYMENT_FAKE_PROVIDER?.trim().toLowerCase()
  const fakeRequested = flag === '1' || flag === 'true'
  if (fakeRequested && env.NODE_ENV === 'production') {
    throw new Error('PAYMENT_FAKE_PROVIDER is set in production — refusing to start (it would unlock the printout for free, #450 D7).')
  }
  const stripe = resolveStripeConfig(env)
  if (stripe) return new StripePaymentProvider(stripe)
  return fakeRequested ? new FakePaymentProvider() : null
}
