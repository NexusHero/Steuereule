import type { UnlockTier } from './unlock.repository.js'

export const PAYMENT_PROVIDER = Symbol('ZAHLUNGSANBIETER')

export interface CheckoutRequest {
  userId: string
  taxYear: number
  /** Which price the session charges (ADR-0101 §21); `standard` when not given. */
  tier?: UnlockTier
  successUrl: string
  cancelUrl: string
  /**
   * Two requests with the same key get the same session (API-4): two tabs paying at once, or a retry
   * after the local row could not be written, never open a second payable session.
   */
  idempotencyKey?: string
}

export interface CheckoutSession {
  id: string
  url: string
}

/** Who a paid session belongs to, from the session's own metadata: lets a lost local row be rebuilt (API-4). */
export interface SessionOwner {
  userId: string
  taxYear: number
  tier: UnlockTier
}

export type PaymentEvent =
  | { kind: 'bezahlt'; sessionId: string; amountCents: number | null; owner?: SessionOwner }
  /** A full refund or an opened dispute: the money is gone again, so is the unlock (API-4). */
  | { kind: 'zurueckgenommen'; sessionId: string; reason: 'erstattet' | 'angefochten' }
  /** A dispute closed in the seller's favour: the unlock it took back returns. */
  | { kind: 'wiederhergestellt'; sessionId: string }
  | { kind: 'ignoriert' }

/** What became of an earlier checkout session (API-4: reuse it, or learn it was paid before the webhook came). */
export type CheckoutLookup =
  | { state: 'open'; url: string }
  | { state: 'paid'; amountCents: number | null }
  /** Completed, but an asynchronous payment (e.g. SEPA) is not settled yet. */
  | { state: 'pending' }
  | { state: 'closed' }

/** A price as the checkout charges it: gross, in the currency's minor unit. */
export interface Price {
  amountCents: number
  currency: string
}

/** No price is configured for the tier, so it cannot be sold in this environment. */
export class PriceNotConfiguredError extends Error {
  constructor(readonly tier: UnlockTier) {
    super(`No Stripe price is configured for the tier "${tier}".`)
    this.name = 'PriceNotConfiguredError'
  }
}

/** The provider could not be asked while resolving a verified event: the webhook answers 503, so it is redelivered. */
export class PaymentProviderUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'PaymentProviderUnavailableError'
  }
}

export interface PaymentProvider {
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>
  lookupCheckout(sessionId: string): Promise<CheckoutLookup>
  /** The price the checkout of `tier` charges (WEB-16); null when it cannot be read right now. */
  priceOf(tier: UnlockTier): Promise<Price | null>
  verifyEvent(rawData: Buffer, signature: string): Promise<PaymentEvent>
}
