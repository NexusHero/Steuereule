export const PAYMENT_PROVIDER = Symbol('ZAHLUNGSANBIETER')

export interface CheckoutRequest {
  userId: string
  taxYear: number
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
