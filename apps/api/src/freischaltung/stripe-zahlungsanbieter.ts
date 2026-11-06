import Stripe from 'stripe'
import type { CheckoutRequest, CheckoutSession, PaymentProvider, PaymentEvent } from './zahlungsanbieter.js'

export interface StripeConfig {
  secretKey: string
  webhookSecret: string
  priceId: string
}

export function resolveStripeConfig(env: NodeJS.ProcessEnv = process.env): StripeConfig | undefined {
  const secretKey = env.STRIPE_SECRET_KEY?.trim()
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim()
  const priceId = env.STRIPE_PRICE_ID?.trim()
  const set = [secretKey, webhookSecret, priceId].filter(Boolean).length
  if (set === 0) return undefined
  if (!secretKey || !webhookSecret || !priceId) {
    throw new Error('STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and STRIPE_PRICE_ID must be set together.')
  }
  return { secretKey, webhookSecret, priceId }
}

export const REVOCATION_NOTICE =
  'Ich stimme ausdrücklich zu, dass SteuerEule vor Ablauf der Widerrufsfrist mit der ' +
  'Bereitstellung des Formular-Ausdrucks beginnt, und weiß, dass ich dadurch mein ' +
  'Widerrufsrecht verliere.'

/** Stripe Checkout adapter. */
export class StripePaymentProvider implements PaymentProvider {
  private readonly stripe: Stripe

  constructor(private readonly config: StripeConfig) {
    this.stripe = new Stripe(config.secretKey)
  }

  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: this.config.priceId, quantity: 1 }],
      client_reference_id: request.userId,
      metadata: { userId: request.userId, steuerjahr: String(request.steuerjahr) },
      success_url: request.successUrl,
      cancel_url: request.cancelUrl,
      locale: 'de',
      consent_collection: { terms_of_service: 'required' },
      custom_text: { terms_of_service_acceptance: { message: REVOCATION_NOTICE } },
      invoice_creation: { enabled: true },
    })
    if (!session.url) throw new Error('Stripe returned a Checkout Session without a URL')
    return { id: session.id, url: session.url }
  }

  verifyEvent(rawData: Buffer, signature: string): PaymentEvent {
    const event = this.stripe.webhooks.constructEvent(rawData, signature, this.config.webhookSecret)
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object
      if (session.payment_status === 'paid') {
        return { art: 'bezahlt', sessionId: session.id, betragCent: session.amount_total ?? null }
      }
    }
    return { art: 'ignoriert' }
  }
}
