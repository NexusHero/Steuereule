import { Inject, Injectable } from '@nestjs/common'
import { UnauthenticatedError, UnavailableError } from '../common/domain-error.js'
import { UNLOCK_REPOSITORY, type UnlockRepository } from './freischaltung.repository.js'
import { PAYMENT_PROVIDER, type PaymentProvider } from './zahlungsanbieter.js'

export const WEB_APP_URL_TOKEN = Symbol('WEB_APP_URL')

export type UnlockStatus = 'freigeschaltet' | 'offen' | 'nicht-verfuegbar'

/** Paid unlock per tax year: the user pays once per Steuerjahr before the Formular-Ausdruck is handed out. */
@Injectable()
export class UnlockService {
  constructor(
    @Inject(UNLOCK_REPOSITORY) private readonly repository: UnlockRepository,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider | null,
    @Inject(WEB_APP_URL_TOKEN) private readonly webAppUrl: string,
  ) {}

  async status(userId: string, taxYear: number): Promise<UnlockStatus> {
    if (await this.repository.isPaid(userId, taxYear)) return 'freigeschaltet'
    return this.provider ? 'offen' : 'nicht-verfuegbar'
  }

  async startCheckout(userId: string, taxYear: number): Promise<{ checkoutUrl: string }> {
    if (!this.provider) {
      throw new UnavailableError('PAYMENT_NOT_CONFIGURED', 'Payment is not configured in this environment.')
    }
    const returnTrip = `${this.webAppUrl}/app/steuerjahr/${taxYear}/ausdruck`
    const session = await this.provider.createCheckout({
      userId,
      taxYear,
      successUrl: `${returnTrip}?zahlung=erfolg`,
      cancelUrl: `${returnTrip}?zahlung=abbruch`,
    })
    await this.repository.createOpenOnes(userId, taxYear, session.id)
    return { checkoutUrl: session.url }
  }

  async processWebhook(rawData: Buffer | undefined, signature: string | undefined, now = new Date()): Promise<void> {
    if (!this.provider) throw new UnavailableError('PAYMENT_NOT_CONFIGURED', 'Payment is not configured in this environment.')
    if (!rawData || !signature) throw new UnauthenticatedError('WEBHOOK_SIGNATURE_MISSING', 'The webhook signature is missing.')
    let event
    try {
      event = this.provider.verifyEvent(rawData, signature)
    } catch {
      throw new UnauthenticatedError('WEBHOOK_SIGNATURE_INVALID', 'The webhook signature is invalid.')
    }
    if (event.kind === 'bezahlt') {
      await this.repository.markPaid(event.sessionId, event.amountCents, now)
    }
  }
}
