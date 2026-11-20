import { Inject, Injectable, Optional } from '@nestjs/common'
import { UnauthenticatedError, UnavailableError } from '../common/domain-error.js'
import { declaresSelfEmployment, filingPathOf, selfEmploymentEnabled, type FilingPath } from '../config/self-employment.js'
import { answersFrom } from '../interview/answers.js'
import { INTERVIEW_ANSWER_REPOSITORY, type InterviewAnswerRepository } from '../interview/interview-answer.repository.js'
import { UNLOCK_REPOSITORY, type UnlockRepository, type UnlockTier } from './unlock.repository.js'
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment-provider.js'

export const WEB_APP_URL_TOKEN = Symbol('WEB_APP_URL')

export type UnlockStatus = 'freigeschaltet' | 'offen' | 'nicht-verfuegbar'

/** Paid unlock per tax year: the user pays once per Steuerjahr before the Formular-Ausdruck is handed out. */
@Injectable()
export class UnlockService {
  constructor(
    @Inject(UNLOCK_REPOSITORY) private readonly repository: UnlockRepository,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider | null,
    @Inject(WEB_APP_URL_TOKEN) private readonly webAppUrl: string,
    @Optional() @Inject(INTERVIEW_ANSWER_REPOSITORY) private readonly interview?: InterviewAnswerRepository,
  ) {}

  /**
   * The tier a year needs (ADR-0101 §21): with the self-employment switch on and a job with a business,
   * the higher one; otherwise the standard one, exactly as before.
   */
  async requiredTier(userId: string, taxYear: number): Promise<UnlockTier> {
    if (!this.interview || !selfEmploymentEnabled()) return 'standard'
    const answers = answersFrom(await this.interview.findAllForUserAndYear(userId, taxYear))
    return declaresSelfEmployment(answers.job) ? 'selbststaendig' : 'standard'
  }

  /** Where the user files the year: the printout's paper path or the ELSTER fill-in help (ADR-0101 §16). */
  async filingPath(userId: string, taxYear: number): Promise<FilingPath> {
    if (!this.interview) return 'papier'
    return filingPathOf(answersFrom(await this.interview.findAllForUserAndYear(userId, taxYear)).job)
  }

  /** Unlocked when the year is paid at the tier it needs; every paid part (printout, fill-in help, exports) asks here. */
  async status(userId: string, taxYear: number): Promise<UnlockStatus> {
    if (await this.repository.isPaid(userId, taxYear, await this.requiredTier(userId, taxYear))) return 'freigeschaltet'
    return this.provider ? 'offen' : 'nicht-verfuegbar'
  }

  async startCheckout(userId: string, taxYear: number): Promise<{ checkoutUrl: string }> {
    if (!this.provider) {
      throw new UnavailableError('PAYMENT_NOT_CONFIGURED', 'Payment is not configured in this environment.')
    }
    const tier = await this.requiredTier(userId, taxYear)
    // The self-employed come back to the fill-in help they paid for, everyone else to the printout.
    const returnTrip = tier === 'selbststaendig' ? `${this.webAppUrl}/app/steuerjahr/${taxYear}/selbststaendig/elster` : `${this.webAppUrl}/app/steuerjahr/${taxYear}/ausdruck`
    let session
    try {
      session = await this.provider.createCheckout({
      userId,
      taxYear,
      tier,
      successUrl: `${returnTrip}?zahlung=erfolg`,
      cancelUrl: `${returnTrip}?zahlung=abbruch`,
      })
    } catch (error) {
      if (tier === 'selbststaendig' && error instanceof Error && error.message.includes('STRIPE_PRICE_ID_SELBSTSTAENDIG')) {
        throw new UnavailableError('PAYMENT_TIER_NOT_CONFIGURED', 'Die Freischaltung für Selbstständige ist hier noch nicht eingerichtet.')
      }
      throw error
    }
    await this.repository.createOpenOnes(userId, taxYear, session.id, tier)
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
