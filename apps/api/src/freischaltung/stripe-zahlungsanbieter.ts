// Stripe Checkout adapter (ADR-0050). Stripe Payments Europe Ltd. (Ireland) is the
// contracting entity for EU merchants; card data never touches this server — the user
// pays on Stripe's hosted page and only a signed webhook comes back.
import Stripe from 'stripe'
import type { CheckoutAnfrage, CheckoutSitzung, Zahlungsanbieter, ZahlungsEreignis } from './zahlungsanbieter.js'

export interface StripeConfig {
  secretKey: string
  webhookSecret: string
  /** The Stripe Price of one tax year's Ausdruck (amount and tax live in Stripe). */
  priceId: string
}

/**
 * `undefined` = payment not configured: the unlock answers "nicht verfügbar" instead of
 * pretending. A half configuration is always a deployment error.
 */
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

// Wording for § 356 Abs. 5 BGB: the right of withdrawal for digital content ends only
// with the consumer's express consent and acknowledgement before performance starts.
export const WIDERRUF_HINWEIS =
  'Ich stimme ausdrücklich zu, dass SteuerEule vor Ablauf der Widerrufsfrist mit der ' +
  'Bereitstellung des Formular-Ausdrucks beginnt, und weiß, dass ich dadurch mein ' +
  'Widerrufsrecht verliere.'

export class StripeZahlungsanbieter implements Zahlungsanbieter {
  private readonly stripe: Stripe

  constructor(private readonly config: StripeConfig) {
    this.stripe = new Stripe(config.secretKey)
  }

  async erstelleCheckout(anfrage: CheckoutAnfrage): Promise<CheckoutSitzung> {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: this.config.priceId, quantity: 1 }],
      client_reference_id: anfrage.userId,
      metadata: { userId: anfrage.userId, steuerjahr: String(anfrage.steuerjahr) },
      success_url: anfrage.erfolgUrl,
      cancel_url: anfrage.abbruchUrl,
      locale: 'de',
      // Requires the AGB URL to be set in the Stripe dashboard (Settings → Public details).
      consent_collection: { terms_of_service: 'required' },
      custom_text: { terms_of_service_acceptance: { message: WIDERRUF_HINWEIS } },
      invoice_creation: { enabled: true },
    })
    if (!session.url) throw new Error('Stripe returned a Checkout Session without a URL')
    return { id: session.id, url: session.url }
  }

  verifiziereEreignis(rohdaten: Buffer, signatur: string): ZahlungsEreignis {
    const event = this.stripe.webhooks.constructEvent(rohdaten, signatur, this.config.webhookSecret)
    // SEPA and other delayed methods complete the session unpaid and confirm later via
    // async_payment_succeeded — both paths end in the same "bezahlt".
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object
      if (session.payment_status === 'paid') {
        return { art: 'bezahlt', sitzungId: session.id, betragCent: session.amount_total ?? null }
      }
    }
    return { art: 'ignoriert' }
  }
}
