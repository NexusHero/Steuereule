// Paid unlock per tax year (ADR-0050): the user pays once per Steuerjahr before the
// Formular-Ausdruck is handed out. Only the verified webhook flips an unlock to paid —
// the browser's success redirect is a UX hint and proves nothing.
import { Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common'
import { FREISCHALTUNG_REPOSITORY, type FreischaltungRepository } from './freischaltung.repository.js'
import { ZAHLUNGSANBIETER, type Zahlungsanbieter } from './zahlungsanbieter.js'

export const WEB_APP_URL_TOKEN = Symbol('WEB_APP_URL')

export type FreischaltungStatus = 'freigeschaltet' | 'offen' | 'nicht-verfuegbar'

@Injectable()
export class FreischaltungService {
  constructor(
    @Inject(FREISCHALTUNG_REPOSITORY) private readonly repository: FreischaltungRepository,
    // null when Stripe is not configured — the honest "nicht verfügbar" state.
    @Inject(ZAHLUNGSANBIETER) private readonly anbieter: Zahlungsanbieter | null,
    @Inject(WEB_APP_URL_TOKEN) private readonly webAppUrl: string,
  ) {}

  async status(userId: string, steuerjahr: number): Promise<FreischaltungStatus> {
    if (await this.repository.istBezahlt(userId, steuerjahr)) return 'freigeschaltet'
    return this.anbieter ? 'offen' : 'nicht-verfuegbar'
  }

  async starteCheckout(userId: string, steuerjahr: number): Promise<{ checkoutUrl: string }> {
    if (!this.anbieter) {
      throw new ServiceUnavailableException('Die Bezahlung ist auf dieser Umgebung nicht eingerichtet.')
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
    if (!this.anbieter) throw new ServiceUnavailableException('Zahlungsanbieter nicht eingerichtet.')
    if (!rohdaten || !signatur) throw new UnauthorizedException('Signatur fehlt.')
    let ereignis
    try {
      ereignis = this.anbieter.verifiziereEreignis(rohdaten, signatur)
    } catch {
      // Unverifiable payloads are rejected without echoing anything back.
      throw new UnauthorizedException('Signatur ungültig.')
    }
    if (ereignis.art === 'bezahlt') {
      await this.repository.markiereBezahlt(ereignis.sitzungId, ereignis.betragCent, jetzt)
    }
  }
}
