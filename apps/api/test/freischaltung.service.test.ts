// ADR-0050 — the paid unlock per tax year, against an in-memory repository and a fake
// provider. Signature verification itself is proven with real Stripe signatures in
// stripe-zahlungsanbieter.test.ts; here the fake decides what "verified" means.
import { beforeEach, describe, expect, it } from 'vitest'
import type { UnlockRepository } from '../src/freischaltung/freischaltung.repository.js'
import { UnlockService } from '../src/freischaltung/freischaltung.service.js'
import type { CheckoutRequest, PaymentProvider, PaymentEvent } from '../src/freischaltung/zahlungsanbieter.js'

class FakeUnlockRepository implements UnlockRepository {
  rows: { userId: string; taxYear: number; sessionId: string; status: string; amountCents: number | null }[] = []

  async createOpenOnes(userId: string, taxYear: number, sessionId: string): Promise<void> {
    this.rows.push({ userId, taxYear, sessionId, status: 'offen', amountCents: null })
  }

  async markPaid(sessionId: string, amountCents: number | null): Promise<void> {
    for (const row of this.rows) {
      if (row.sessionId === sessionId && row.status === 'offen') Object.assign(row, { status: 'bezahlt', amountCents })
    }
  }

  async isPaid(userId: string, taxYear: number): Promise<boolean> {
    return this.rows.some((row) => row.userId === userId && row.taxYear === taxYear && row.status === 'bezahlt')
  }
}

class FakeProvider implements PaymentProvider {
  requests: CheckoutRequest[] = []
  nextEvent: PaymentEvent | 'ungueltig' = { kind: 'ignoriert' }

  async createCheckout(request: CheckoutRequest) {
    this.requests.push(request)
    return { id: `cs_${this.requests.length}`, url: `https://checkout.example/cs_${this.requests.length}` }
  }

  verifyEvent(): PaymentEvent {
    if (this.nextEvent === 'ungueltig') throw new Error('No signatures found matching the expected signature')
    return this.nextEvent
  }
}

describe('FreischaltungService', () => {
  let repository: FakeUnlockRepository
  let provider: FakeProvider
  let service: UnlockService

  beforeEach(() => {
    repository = new FakeUnlockRepository()
    provider = new FakeProvider()
    service = new UnlockService(repository, provider, 'https://app.steuereule.de')
  })

  it('a fresh tax year is payable, not unlocked', async () => {
    await expect(service.status('u1', 2025)).resolves.toBe('offen')
  })

  it('checkout records an open unlock and returns the hosted page, with return URLs back into the app', async () => {
    const { checkoutUrl } = await service.startCheckout('u1', 2025)

    expect(checkoutUrl).toBe('https://checkout.example/cs_1')
    expect(repository.rows).toEqual([
      { userId: 'u1', taxYear: 2025, sessionId: 'cs_1', status: 'offen', amountCents: null },
    ])
    expect(provider.requests[0]).toMatchObject({
      successUrl: 'https://app.steuereule.de/app/steuerjahr/2025/ausdruck?zahlung=erfolg',
      cancelUrl: 'https://app.steuereule.de/app/steuerjahr/2025/ausdruck?zahlung=abbruch',
    })
    // An open checkout is not a payment.
    await expect(service.status('u1', 2025)).resolves.toBe('offen')
  })

  it('only a verified "bezahlt" event unlocks — for that user and that tax year only', async () => {
    await service.startCheckout('u1', 2025)
    provider.nextEvent = { kind: 'bezahlt', sessionId: 'cs_1', amountCents: 1999 }

    await service.processWebhook(Buffer.from('{}'), 'sig')

    await expect(service.status('u1', 2025)).resolves.toBe('freigeschaltet')
    await expect(service.status('u1', 2024)).resolves.toBe('offen')
    await expect(service.status('u2', 2025)).resolves.toBe('offen')
    expect(repository.rows[0]!.amountCents).toBe(1999)
  })

  it('a webhook redelivery is idempotent', async () => {
    await service.startCheckout('u1', 2025)
    provider.nextEvent = { kind: 'bezahlt', sessionId: 'cs_1', amountCents: 1999 }
    await service.processWebhook(Buffer.from('{}'), 'sig')
    await service.processWebhook(Buffer.from('{}'), 'sig')
    expect(repository.rows.filter((row) => row.status === 'bezahlt')).toHaveLength(1)
  })

  it('an unverifiable payload is rejected and unlocks nothing', async () => {
    await service.startCheckout('u1', 2025)
    provider.nextEvent = 'ungueltig'
    await expect(service.processWebhook(Buffer.from('{}'), 'forged')).rejects.toMatchObject({ code: 'WEBHOOK_SIGNATURE_INVALID' })
    await expect(service.status('u1', 2025)).resolves.toBe('offen')
  })

  it('a missing signature or raw body is rejected before the provider is asked', async () => {
    await expect(service.processWebhook(undefined, 'sig')).rejects.toMatchObject({ code: 'WEBHOOK_SIGNATURE_MISSING' })
    await expect(service.processWebhook(Buffer.from('{}'), undefined)).rejects.toMatchObject({ code: 'WEBHOOK_SIGNATURE_MISSING' })
  })

  it('without a configured provider the state is honestly "nicht-verfuegbar" and checkout refuses', async () => {
    const without = new UnlockService(repository, null, 'https://app.steuereule.de')
    await expect(without.status('u1', 2025)).resolves.toBe('nicht-verfuegbar')
    await expect(without.startCheckout('u1', 2025)).rejects.toMatchObject({ code: 'PAYMENT_NOT_CONFIGURED' })
  })
})
