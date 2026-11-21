// ADR-0101 §21 — a year with self-employment needs the higher tier (a second Stripe price). The
// standard tier keeps working exactly as before for everyone else.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { UnlockRepository, UnlockTier } from '../src/unlock/unlock.repository.js'
import { UnlockService } from '../src/unlock/unlock.service.js'
import type { CheckoutRequest, PaymentProvider, PaymentEvent } from '../src/unlock/payment-provider.js'
import { FakePaymentProvider } from '../src/unlock/fake-payment-provider.js'
import { resolveStripeConfig, StripePaymentProvider } from '../src/unlock/stripe-payment-provider.js'
import type { InterviewAnswerRepository } from '../src/interview/interview-answer.repository.js'

class FakeUnlockRepository implements UnlockRepository {
  rows: { userId: string; taxYear: number; sessionId: string; status: string; tier: UnlockTier }[] = []
  async createOpenOnes(userId: string, taxYear: number, sessionId: string, tier: UnlockTier = 'standard'): Promise<void> {
    this.rows.push({ userId, taxYear, sessionId, status: 'offen', tier })
  }
  async markPaid(sessionId: string): Promise<void> {
    for (const row of this.rows) if (row.sessionId === sessionId) row.status = 'bezahlt'
  }
  async isPaid(userId: string, taxYear: number, tier: UnlockTier = 'standard'): Promise<boolean> {
    return this.rows.some((r) => r.userId === userId && r.taxYear === taxYear && r.status === 'bezahlt' && (tier === 'standard' || r.tier === 'selbststaendig'))
  }
}

class RecordingProvider implements PaymentProvider {
  requests: CheckoutRequest[] = []
  async createCheckout(request: CheckoutRequest) {
    this.requests.push(request)
    return { id: `cs_${this.requests.length}`, url: 'https://checkout.example' }
  }
  verifyEvent(): PaymentEvent {
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
  })

  it('a paid standard unlock does not open a self-employed year; the self-employment tier does', async () => {
    process.env.SELBSTSTAENDIGE_ENABLED = '1'
    const service = new UnlockService(repository, provider, 'https://app', interviewWith('Selbstständig'))
    await repository.createOpenOnes('u1', 2025, 'cs_std', 'standard')
    await repository.markPaid('cs_std')
    await expect(service.status('u1', 2025)).resolves.toBe('offen')
    await repository.createOpenOnes('u1', 2025, 'cs_se', 'selbststaendig')
    await repository.markPaid('cs_se')
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
    await expect(stripe.createCheckout({ userId: 'u', taxYear: 2025, successUrl: 'https://a', cancelUrl: 'https://b', tier: 'selbststaendig' })).rejects.toThrow(/STRIPE_PRICE_ID_SELBSTSTAENDIG/)
  })

  it('the fake provider serves both tiers', async () => {
    const fake = new FakePaymentProvider()
    await expect(fake.createCheckout({ userId: 'u', taxYear: 2025, successUrl: 'https://ok', cancelUrl: 'https://no', tier: 'selbststaendig' })).resolves.toMatchObject({ url: 'https://ok' })
    await expect(fake.createCheckout({ userId: 'u', taxYear: 2025, successUrl: 'https://ok', cancelUrl: 'https://no', tier: 'standard' })).resolves.toMatchObject({ url: 'https://ok' })
  })
})
