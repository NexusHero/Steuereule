// ADR-0101 §21 — a year with self-employment needs the higher tier (a second Stripe price). The
// standard tier keeps working exactly as before for everyone else.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { UnlockService } from '../src/unlock/unlock.service.js'
import { PriceNotConfiguredError, type CheckoutLookup, type CheckoutRequest, type PaymentProvider, type PaymentEvent } from '../src/unlock/payment-provider.js'
import type { UnlockTier } from '../src/unlock/unlock.repository.js'
import { FakePaymentProvider } from '../src/unlock/fake-payment-provider.js'
import { resolveStripeConfig, StripePaymentProvider } from '../src/unlock/stripe-payment-provider.js'
import type { InterviewAnswerRepository } from '../src/interview/interview-answer.repository.js'
import { FakeUnlockRepository } from './fakes/fake-unlock.repository.js'

class RecordingProvider implements PaymentProvider {
  requests: CheckoutRequest[] = []
  async createCheckout(request: CheckoutRequest) {
    this.requests.push(request)
    return { id: `cs_${this.requests.length}`, url: 'https://checkout.example' }
  }
  async lookupCheckout(): Promise<CheckoutLookup> {
    return { state: 'closed' }
  }
  async priceOf(tier: UnlockTier) {
    return { amountCents: tier === 'selbststaendig' ? 8999 : 3499, currency: 'eur' }
  }
  async verifyEvent(): Promise<PaymentEvent> {
    return { kind: 'bezahlt', sessionId: 'cs_1', amountCents: 4900 }
  }
}

function interviewWith(job: string): InterviewAnswerRepository {
  return { findAllForUserAndYear: async () => [{ questionId: 'job', value: job }] } as unknown as InterviewAnswerRepository
}

describe('unlock tiers (ADR-0101 §21)', () => {
  const previous = process.env.SELBSTSTAENDIGE_ENABLED
  let repository: FakeUnlockRepository
  let provider: RecordingProvider

  beforeEach(() => {
    repository = new FakeUnlockRepository()
    provider = new RecordingProvider()
  })
  afterEach(() => {
    if (previous === undefined) delete process.env.SELBSTSTAENDIGE_ENABLED
    else process.env.SELBSTSTAENDIGE_ENABLED = previous
  })

  it('switch off: a self-employed answer changes nothing, the standard tier is asked for', async () => {
    process.env.SELBSTSTAENDIGE_ENABLED = 'false'
    const service = new UnlockService(repository, provider, 'https://app', interviewWith('Selbstständig'))
    await expect(service.requiredTier('u1', 2025)).resolves.toBe('standard')
    await service.startCheckout('u1', 2025)
    expect(provider.requests[0]?.tier).toBe('standard')
    expect(provider.requests[0]?.successUrl).toBe('https://app/app/steuerjahr/2025/ausdruck?zahlung=erfolg')
    await expect(service.filingPath('u1', 2025)).resolves.toBe('papier')
  })

  it('switch on: a year with self-employment checks out at the self-employment price', async () => {
    process.env.SELBSTSTAENDIGE_ENABLED = 'true'
    const service = new UnlockService(repository, provider, 'https://app', interviewWith('Beides'))
    await expect(service.requiredTier('u1', 2025)).resolves.toBe('selbststaendig')
    await service.startCheckout('u1', 2025)
    expect(provider.requests[0]?.tier).toBe('selbststaendig')
    // The self-employed return to the fill-in help, not to the paper printout (ADR-0101 §16).
    expect(provider.requests[0]?.successUrl).toBe('https://app/app/steuerjahr/2025/selbststaendig/elster?zahlung=erfolg')
    expect(provider.requests[0]?.cancelUrl).toBe('https://app/app/steuerjahr/2025/selbststaendig/elster?zahlung=abbruch')
    await expect(service.filingPath('u1', 2025)).resolves.toBe('elster-ausfuellhilfe')
    expect(repository.rows[0]?.tier).toBe('selbststaendig')
    // WEB-16: the price shown is the one of the tier the checkout charges.
    await expect(service.price('u1', 2025)).resolves.toEqual({ amountCents: 8999, currency: 'eur' })
  })

  it('a paid standard unlock does not open a self-employed year; the self-employment tier does', async () => {
    process.env.SELBSTSTAENDIGE_ENABLED = '1'
    const service = new UnlockService(repository, provider, 'https://app', interviewWith('Selbstständig'))
    await repository.createOpenOnes('u1', 2025, 'cs_std', 'standard')
    await repository.markPaid('cs_std', null, new Date())
    await expect(service.status('u1', 2025)).resolves.toBe('offen')
    await repository.createOpenOnes('u1', 2025, 'cs_se', 'selbststaendig')
    await repository.markPaid('cs_se', null, new Date())
    await expect(service.status('u1', 2025)).resolves.toBe('freigeschaltet')
  })

  it('employees keep the standard tier with the switch on', async () => {
    process.env.SELBSTSTAENDIGE_ENABLED = 'true'
    const service = new UnlockService(repository, provider, 'https://app', interviewWith('Angestellt'))
    await expect(service.requiredTier('u1', 2025)).resolves.toBe('standard')
  })

  it('Stripe reads the second price; without it a self-employment checkout is not possible', async () => {
    expect(resolveStripeConfig({ STRIPE_SECRET_KEY: 'sk', STRIPE_WEBHOOK_SECRET: 'wh', STRIPE_PRICE_ID: 'p1', STRIPE_PRICE_ID_SELBSTSTAENDIG: 'p2' })).toEqual({
      secretKey: 'sk',
      webhookSecret: 'wh',
      priceId: 'p1',
      priceIdSelfEmployed: 'p2',
    })
    const stripe = new StripePaymentProvider({ secretKey: 'sk_test_unit', webhookSecret: 'wh', priceId: 'p1' })
    await expect(stripe.createCheckout({ userId: 'u', taxYear: 2025, successUrl: 'https://a', cancelUrl: 'https://b', tier: 'selbststaendig' })).rejects.toBeInstanceOf(PriceNotConfiguredError)
  })

  it('a deployment without the self-employment price answers 503 PAYMENT_TIER_NOT_CONFIGURED at the checkout', async () => {
    process.env.SELBSTSTAENDIGE_ENABLED = 'true'
    const stripe = new StripePaymentProvider({ secretKey: 'sk_test_unit', webhookSecret: 'wh', priceId: 'p1' })
    const service = new UnlockService(repository, stripe, 'https://app', interviewWith('Selbstständig'))
    await expect(service.startCheckout('u1', 2025)).rejects.toMatchObject({ code: 'PAYMENT_TIER_NOT_CONFIGURED' })
    expect(repository.rows).toEqual([])
  })

  it('the fake provider serves both tiers', async () => {
    const fake = new FakePaymentProvider()
    await expect(fake.createCheckout({ userId: 'u', taxYear: 2025, successUrl: 'https://ok', cancelUrl: 'https://no', tier: 'selbststaendig' })).resolves.toMatchObject({ url: 'https://ok' })
    await expect(fake.createCheckout({ userId: 'u', taxYear: 2025, successUrl: 'https://ok', cancelUrl: 'https://no', tier: 'standard' })).resolves.toMatchObject({ url: 'https://ok' })
  })
})
