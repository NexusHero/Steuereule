import { Inject, Injectable } from '@nestjs/common'
import { UnauthenticatedError, UnavailableError } from '../common/domain-error.js'
import { FREISCHALTUNG_REPOSITORY, type FreischaltungRepository } from './freischaltung.repository.js'
import { ZAHLUNGSANBIETER, type Zahlungsanbieter } from './zahlungsanbieter.js'

export const WEB_APP_URL_TOKEN = Symbol('WEB_APP_URL')

export type FreischaltungStatus = 'freigeschaltet' | 'offen' | 'nicht-verfuegbar'

/** Paid unlock per tax year: the user pays once per Steuerjahr before the Formular-Ausdruck is handed out. */
@Injectable()
export class FreischaltungService {
  constructor(
    @Inject(FREISCHALTUNG_REPOSITORY) private readonly repository: FreischaltungRepository,
    @Inject(ZAHLUNGSANBIETER) private readonly anbieter: Zahlungsanbieter | null,
    @Inject(WEB_APP_URL_TOKEN) private readonly webAppUrl: string,
  ) {}

  async status(userId: string, steuerjahr: number): Promise<FreischaltungStatus> {
    if (await this.repository.istBezahlt(userId, steuerjahr)) return 'freigeschaltet'
    return this.anbieter ? 'offen' : 'nicht-verfuegbar'
  }

  async starteCheckout(userId: string, steuerjahr: number): Promise<{ checkoutUrl: string }> {
    if (!this.anbieter) {
      throw new UnavailableError('PAYMENT_NOT_CONFIGURED', 'Payment is not configured in this environment.')
    }
    const rueckkehr = `${this.webAppUrl}/app/steuerjahr/${steuerjahr}/ausdruck`
    const sitzung = await this.anbieter.erstelleCheckout({
      userId,
      steuerjahr,
      erfolgUrl: `${rueckkehr}?zahlung=erfolg`,
      abbruchUrl: `${rueckkehr}?zahlung=abbruch`,
    })
    await this.repository.legeOffeneAn(userId, steuerjahr, sitzung.id)
    return { checkoutUrl: sitzung.url }
  }

  async verarbeiteWebhook(rohdaten: Buffer | undefined, signatur: string | undefined, jetzt = new Date()): Promise<void> {
    if (!this.anbieter) throw new UnavailableError('PAYMENT_NOT_CONFIGURED', 'Payment is not configured in this environment.')
    if (!rohdaten || !signatur) throw new UnauthenticatedError('WEBHOOK_SIGNATURE_MISSING', 'The webhook signature is missing.')
    let ereignis
    try {
      ereignis = this.anbieter.verifiziereEreignis(rohdaten, signatur)
    } catch {
      throw new UnauthenticatedError('WEBHOOK_SIGNATURE_INVALID', 'The webhook signature is invalid.')
    }
    if (ereignis.art === 'bezahlt') {
      await this.repository.markiereBezahlt(ereignis.sitzungId, ereignis.betragCent, jetzt)
    }
  }
}

export { FreischaltungService as UnlockService }

