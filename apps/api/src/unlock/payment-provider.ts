import type { UnlockTier } from './unlock.repository.js'

export const PAYMENT_PROVIDER = Symbol('ZAHLUNGSANBIETER')

export interface CheckoutRequest {
  userId: string
  taxYear: number
  /** Which price the session charges (ADR-0101 §21); `standard` when not given. */
  tier?: UnlockTier
  successUrl: string
  cancelUrl: string
}

export interface CheckoutSession {
  id: string
  url: string
}

export type PaymentEvent =
  | { kind: 'bezahlt'; sessionId: string; amountCents: number | null }
  | { kind: 'ignoriert' }

export interface PaymentProvider {
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>
  verifyEvent(rawData: Buffer, signature: string): PaymentEvent
}
