// ADR-0050 — the paid unlock per tax year, against an in-memory repository and a fake
// provider. Signature verification itself is proven with real Stripe signatures in
// stripe-zahlungsanbieter.test.ts; here the fake decides what "verified" means.
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common'
import { beforeEach, describe, expect, it } from 'vitest'
import type { FreischaltungRepository } from '../src/freischaltung/freischaltung.repository.js'
import { FreischaltungService } from '../src/freischaltung/freischaltung.service.js'
import type { CheckoutAnfrage, Zahlungsanbieter, ZahlungsEreignis } from '../src/freischaltung/zahlungsanbieter.js'

class FakeFreischaltungRepository implements FreischaltungRepository {
  rows: { userId: string; steuerjahr: number; sitzungId: string; status: string; betragCent: number | null }[] = []

  async legeOffeneAn(userId: string, steuerjahr: number, sitzungId: string): Promise<void> {
    this.rows.push({ userId, steuerjahr, sitzungId, status: 'offen', betragCent: null })
  }

  async markiereBezahlt(sitzungId: string, betragCent: number | null): Promise<void> {
    for (const row of this.rows) {
      if (row.sitzungId === sitzungId && row.status === 'offen') Object.assign(row, { status: 'bezahlt', betragCent })
    }
  }

  async istBezahlt(userId: string, steuerjahr: number): Promise<boolean> {
    return this.rows.some((row) => row.userId === userId && row.steuerjahr === steuerjahr && row.status === 'bezahlt')
  }
}

class FakeAnbieter implements Zahlungsanbieter {
  anfragen: CheckoutAnfrage[] = []
  naechstesEreignis: ZahlungsEreignis | 'ungueltig' = { art: 'ignoriert' }

  async erstelleCheckout(anfrage: CheckoutAnfrage) {
    this.anfragen.push(anfrage)
    return { id: `cs_${this.anfragen.length}`, url: `https://checkout.example/cs_${this.anfragen.length}` }
  }

  verifiziereEreignis(): ZahlungsEreignis {
    if (this.naechstesEreignis === 'ungueltig') throw new Error('No signatures found matching the expected signature')
    return this.naechstesEreignis
  }
}

describe('FreischaltungService', () => {
  let repository: FakeFreischaltungRepository
  let anbieter: FakeAnbieter
  let service: FreischaltungService

  beforeEach(() => {
    repository = new FakeFreischaltungRepository()
    anbieter = new FakeAnbieter()
    service = new FreischaltungService(repository, anbieter, 'https://app.steuereule.de')
  })

  it('a fresh tax year is payable, not unlocked', async () => {
    await expect(service.status('u1', 2025)).resolves.toBe('offen')
  })

  it('checkout records an open unlock and returns the hosted page, with return URLs back into the app', async () => {
    const { checkoutUrl } = await service.starteCheckout('u1', 2025)

    expect(checkoutUrl).toBe('https://checkout.example/cs_1')
    expect(repository.rows).toEqual([
      { userId: 'u1', steuerjahr: 2025, sitzungId: 'cs_1', status: 'offen', betragCent: null },
    ])
    expect(anbieter.anfragen[0]).toMatchObject({
      erfolgUrl: 'https://app.steuereule.de/app/steuerjahr/2025/ausdruck?zahlung=erfolg',
      abbruchUrl: 'https://app.steuereule.de/app/steuerjahr/2025/ausdruck?zahlung=abbruch',
    })
    // An open checkout is not a payment.
    await expect(service.status('u1', 2025)).resolves.toBe('offen')
  })

  it('only a verified "bezahlt" event unlocks — for that user and that tax year only', async () => {
    await service.starteCheckout('u1', 2025)
    anbieter.naechstesEreignis = { art: 'bezahlt', sitzungId: 'cs_1', betragCent: 1999 }

    await service.verarbeiteWebhook(Buffer.from('{}'), 'sig')

    await expect(service.status('u1', 2025)).resolves.toBe('freigeschaltet')
    await expect(service.status('u1', 2024)).resolves.toBe('offen')
    await expect(service.status('u2', 2025)).resolves.toBe('offen')
    expect(repository.rows[0]!.betragCent).toBe(1999)
  })

  it('a webhook redelivery is idempotent', async () => {
    await service.starteCheckout('u1', 2025)
    anbieter.naechstesEreignis = { art: 'bezahlt', sitzungId: 'cs_1', betragCent: 1999 }
    await service.verarbeiteWebhook(Buffer.from('{}'), 'sig')
    await service.verarbeiteWebhook(Buffer.from('{}'), 'sig')
    expect(repository.rows.filter((row) => row.status === 'bezahlt')).toHaveLength(1)
  })

  it('an unverifiable payload is rejected and unlocks nothing', async () => {
    await service.starteCheckout('u1', 2025)
    anbieter.naechstesEreignis = 'ungueltig'
    await expect(service.verarbeiteWebhook(Buffer.from('{}'), 'forged')).rejects.toBeInstanceOf(UnauthorizedException)
    await expect(service.status('u1', 2025)).resolves.toBe('offen')
  })

  it('a missing signature or raw body is rejected before the provider is asked', async () => {
    await expect(service.verarbeiteWebhook(undefined, 'sig')).rejects.toBeInstanceOf(UnauthorizedException)
    await expect(service.verarbeiteWebhook(Buffer.from('{}'), undefined)).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('without a configured provider the state is honestly "nicht-verfuegbar" and checkout refuses', async () => {
    const ohne = new FreischaltungService(repository, null, 'https://app.steuereule.de')
    await expect(ohne.status('u1', 2025)).resolves.toBe('nicht-verfuegbar')
    await expect(ohne.starteCheckout('u1', 2025)).rejects.toBeInstanceOf(ServiceUnavailableException)
  })
})
