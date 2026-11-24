import { randomUUID } from 'node:crypto'
import type { CheckoutLookup, CheckoutRequest, CheckoutSession, PaymentEvent, PaymentProvider, Price } from './payment-provider.js'
import type { UnlockTier } from './unlock.repository.js'
import { resolveStripeConfig, StripePaymentProvider } from './stripe-payment-provider.js'

/** The only signature the fake provider's webhook accepts (#450 D7: test unlock, never in production). */
export const FAKE_PAYMENT_SIGNATURE = 'fake-payment-signature'

/**
 * Test replacement for Stripe (#450 5C, D7): "checkout" returns to the success URL at once and the
 * paid event is posted to the real webhook endpoint by the test, so the app, the unlock table and
 * the printout gate run unchanged. Selectable only with PAYMENT_FAKE_PROVIDER=1 outside production.
 */
export class FakePaymentProvider implements PaymentProvider {
  /** Test prices, never shown in production (the fake refuses to start there). */
  static readonly PRICES: Readonly<Record<UnlockTier, Price>> = {
    standard: { amountCents: 3499, currency: 'eur' },
    selbststaendig: { amountCents: 8999, currency: 'eur' },
  }

  private readonly sessions = new Map<string, CheckoutSession>()
  private readonly byKey = new Map<string, CheckoutSession>()

  /** Both tiers (ADR-0101 §21): the tier is stored with the open unlock, so the paid event needs no price. */
  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    const known = request.idempotencyKey ? this.byKey.get(request.idempotencyKey) : undefined
    if (known) return known
    const session = { id: `fake_cs_${request.tier ?? 'standard'}_${randomUUID()}`, url: request.successUrl }
    this.sessions.set(session.id, session)
    if (request.idempotencyKey) this.byKey.set(request.idempotencyKey, session)
    return session
  }

  /** A session this process created stays open (its URL is the success URL); any other one is closed. */
  async lookupCheckout(sessionId: string): Promise<CheckoutLookup> {
    const session = this.sessions.get(sessionId)
    return session ? { state: 'open', url: session.url } : { state: 'closed' }
  }

  async priceOf(tier: UnlockTier): Promise<Price> {
    return FakePaymentProvider.PRICES[tier]
  }

  /** `{ sessionId }` is the paid event; `{ sessionId, kind: 'erstattet' | 'angefochten' }` takes it back. */
  async verifyEvent(rawData: Buffer, signature: string): Promise<PaymentEvent> {
    if (signature !== FAKE_PAYMENT_SIGNATURE) throw new Error('invalid fake payment signature')
    const parsed = JSON.parse(rawData.toString('utf8')) as { sessionId?: unknown; kind?: unknown }
    if (typeof parsed.sessionId !== 'string' || parsed.sessionId === '') throw new Error('the fake paid event needs a sessionId')
    if (parsed.kind === 'erstattet' || parsed.kind === 'angefochten') return { kind: 'zurueckgenommen', sessionId: parsed.sessionId, reason: parsed.kind }
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
