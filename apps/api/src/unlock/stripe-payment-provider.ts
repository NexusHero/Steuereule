import Stripe from 'stripe'
import { PaymentProviderUnavailableError, PriceNotConfiguredError, type CheckoutLookup, type CheckoutRequest, type CheckoutSession, type PaymentEvent, type PaymentProvider, type Price, type SessionOwner } from './payment-provider.js'
import type { UnlockTier } from './unlock.repository.js'

export interface StripeConfig {
  secretKey: string
  webhookSecret: string
  priceId: string
  /** STRIPE_PRICE_ID_SELBSTSTAENDIG: the higher price for a year with self-employment (ADR-0101 §21); optional. */
  priceIdSelfEmployed?: string
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
  const priceIdSelfEmployed = env.STRIPE_PRICE_ID_SELBSTSTAENDIG?.trim()
  return { secretKey, webhookSecret, priceId, ...(priceIdSelfEmployed ? { priceIdSelfEmployed } : {}) }
}

/**
 * The consent to start before the withdrawal period ends (§ 356 Abs. 5 BGB), naming what the tier
 * actually provides (H2-39): the printout, or for the self-employed the fill-in help and exports too.
 */
export const REVOCATION_NOTICE: Readonly<Record<UnlockTier, string>> = {
  standard:
    'Ich stimme ausdrücklich zu, dass SteuerEule vor Ablauf der Widerrufsfrist mit der ' +
    'Bereitstellung des Formular-Ausdrucks für dieses Steuerjahr beginnt, und weiß, dass ich dadurch mein ' +
    'Widerrufsrecht verliere.',
  selbststaendig:
    'Ich stimme ausdrücklich zu, dass SteuerEule vor Ablauf der Widerrufsfrist mit der ' +
    'Bereitstellung der Freischaltung für Selbstständige für dieses Steuerjahr (Ausfüllhilfe für Mein ELSTER, ' +
    'Exporte und Formular-Ausdruck) beginnt, und weiß, dass ich dadurch mein Widerrufsrecht verliere.',
}

/** How long a price read from Stripe is reused before it is read again. */
const PRICE_CACHE_MS = 10 * 60_000

/** The parts of the Stripe SDK the adapter uses; a test passes a stub, production the real client. */
export type StripeClient = Pick<Stripe, 'checkout' | 'prices' | 'webhooks'>

/** Stripe Checkout adapter. */
export class StripePaymentProvider implements PaymentProvider {
  private readonly stripe: StripeClient
  private readonly prices = new Map<string, { price: Price; at: number }>()

  constructor(
    private readonly config: StripeConfig,
    client?: StripeClient,
    private readonly clock: () => number = Date.now,
  ) {
    this.stripe = client ?? new Stripe(config.secretKey)
  }

  private priceIdOf(tier: UnlockTier): string | undefined {
    return tier === 'selbststaendig' ? this.config.priceIdSelfEmployed : this.config.priceId
  }

  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    const tier = request.tier ?? 'standard'
    const price = this.priceIdOf(tier)
    if (!price) throw new PriceNotConfiguredError(tier)
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: 'payment',
        line_items: [{ price, quantity: 1 }],
        client_reference_id: request.userId,
        metadata: { userId: request.userId, steuerjahr: String(request.taxYear), stufe: tier },
        success_url: request.successUrl,
        cancel_url: request.cancelUrl,
        locale: 'de',
        consent_collection: { terms_of_service: 'required' },
        custom_text: { terms_of_service_acceptance: { message: REVOCATION_NOTICE[tier] } },
        invoice_creation: { enabled: true },
      },
      request.idempotencyKey ? { idempotencyKey: request.idempotencyKey } : undefined,
    )
    if (!session.url) throw new Error('Stripe returned a Checkout Session without a URL')
    return { id: session.id, url: session.url }
  }

  async lookupCheckout(sessionId: string): Promise<CheckoutLookup> {
    let session: Stripe.Checkout.Session
    try {
      session = await this.stripe.checkout.sessions.retrieve(sessionId)
    } catch (error) {
      // A session Stripe does not know (another account, a fake one from a test run) can never be paid.
      if (error instanceof Stripe.errors.StripeInvalidRequestError && error.code === 'resource_missing') return { state: 'closed' }
      throw error
    }
    if (session.status === 'open' && session.url) return { state: 'open', url: session.url }
    if (session.status === 'complete') {
      return session.payment_status === 'unpaid' ? { state: 'pending' } : { state: 'paid', amountCents: session.amount_total ?? null }
    }
    return { state: 'closed' }
  }

  async priceOf(tier: UnlockTier): Promise<Price | null> {
    const id = this.priceIdOf(tier)
    if (!id) return null
    const cached = this.prices.get(id)
    if (cached && this.clock() - cached.at < PRICE_CACHE_MS) return cached.price
    try {
      const price = await this.stripe.prices.retrieve(id)
      if (price.unit_amount === null) return null
      const read = { amountCents: price.unit_amount, currency: price.currency }
      this.prices.set(id, { price: read, at: this.clock() })
      return read
    } catch {
      return null
    }
  }

  async verifyEvent(rawData: Buffer, signature: string): Promise<PaymentEvent> {
    const event = this.stripe.webhooks.constructEvent(rawData, signature, this.config.webhookSecret)
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object
        if (session.payment_status !== 'paid') return { kind: 'ignoriert' }
        const owner = ownerOf(session.metadata)
        return { kind: 'bezahlt', sessionId: session.id, amountCents: session.amount_total ?? null, ...(owner ? { owner } : {}) }
      }
      case 'charge.refunded': {
        // Only a full refund takes the unlock back; a partial one is a goodwill gesture.
        const charge = event.data.object
        if (!charge.refunded) return { kind: 'ignoriert' }
        const sessionId = await this.sessionOfPaymentIntent(charge.payment_intent)
        return sessionId ? { kind: 'zurueckgenommen', sessionId, reason: 'erstattet' } : { kind: 'ignoriert' }
      }
      case 'charge.dispute.created': {
        const sessionId = await this.sessionOfPaymentIntent(event.data.object.payment_intent)
        return sessionId ? { kind: 'zurueckgenommen', sessionId, reason: 'angefochten' } : { kind: 'ignoriert' }
      }
      case 'charge.dispute.closed': {
        if (event.data.object.status !== 'won') return { kind: 'ignoriert' }
        const sessionId = await this.sessionOfPaymentIntent(event.data.object.payment_intent)
        return sessionId ? { kind: 'wiederhergestellt', sessionId } : { kind: 'ignoriert' }
      }
      default:
        return { kind: 'ignoriert' }
    }
  }

  /** Refunds and disputes name the payment, not the checkout session; Stripe says which session it was. */
  private async sessionOfPaymentIntent(paymentIntent: string | Stripe.PaymentIntent | null): Promise<string | null> {
    const id = typeof paymentIntent === 'string' ? paymentIntent : (paymentIntent?.id ?? null)
    if (id === null) return null
    try {
      const sessions = await this.stripe.checkout.sessions.list({ payment_intent: id, limit: 1 })
      return sessions.data[0]?.id ?? null
    } catch (error) {
      throw new PaymentProviderUnavailableError('Stripe could not say which checkout session the payment belongs to.', { cause: error })
    }
  }
}

function ownerOf(metadata: Stripe.Metadata | null): SessionOwner | undefined {
  const userId = metadata?.userId
  const taxYear = Number(metadata?.steuerjahr)
  const tier = metadata?.stufe === 'selbststaendig' ? 'selbststaendig' : metadata?.stufe === 'standard' ? 'standard' : undefined
  if (!userId || !Number.isInteger(taxYear) || tier === undefined) return undefined
  return { userId, taxYear, tier }
}
