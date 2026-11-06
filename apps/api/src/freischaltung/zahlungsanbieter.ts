export const PAYMENT_PROVIDER = Symbol('ZAHLUNGSANBIETER')

export interface CheckoutRequest {
  userId: string
  steuerjahr: number
  successUrl: string
  cancelUrl: string
}

export interface CheckoutSession {
  id: string
  url: string
}

export type PaymentEvent =
  | { art: 'bezahlt'; sessionId: string; betragCent: number | null }
  | { art: 'ignoriert' }

export interface PaymentProvider {
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>
  verifyEvent(rawData: Buffer, signature: string): PaymentEvent
}
