import { withSystemDatabaseAccess } from '../common/database-identity.js'
import { Inject, Injectable, Optional } from '@nestjs/common'
import { PAYMENT_RETURN, paymentReturnUrl } from '@steuereule/core'
import { ConflictError, UnauthenticatedError, UnavailableError } from '../common/domain-error.js'
import { declaresSelfEmployment, filingPathOf, selfEmploymentEnabled, type FilingPath } from '../config/self-employment.js'
import { answersFrom } from '../interview/answers.js'
import { INTERVIEW_ANSWER_REPOSITORY, type InterviewAnswerRepository } from '../interview/interview-answer.repository.js'
import { UNLOCK_REPOSITORY, type UnlockRepository, type UnlockTier } from './unlock.repository.js'
import { PAYMENT_PROVIDER, PaymentProviderUnavailableError, type PaymentProvider, type Price } from './payment-provider.js'

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
    return declaresSelfEmployment(answers) ? 'selbststaendig' : 'standard'
  }

  /** Where the user files the year: the printout's paper path or the ELSTER fill-in help (ADR-0101 §16). */
  async filingPath(userId: string, taxYear: number): Promise<FilingPath> {
    if (!this.interview) return 'papier'
    return filingPathOf(answersFrom(await this.interview.findAllForUserAndYear(userId, taxYear)))
  }

  /** Unlocked when the year is paid at the tier it needs; every paid part (printout, fill-in help, exports) asks here. */
  async status(userId: string, taxYear: number): Promise<UnlockStatus> {
    if (await this.repository.isPaid(userId, taxYear, await this.requiredTier(userId, taxYear))) return 'freigeschaltet'
    return this.provider ? 'offen' : 'nicht-verfuegbar'
  }

  /** The price the year's checkout would charge, read from the provider's own price (WEB-16); null when unknown. */
  async price(userId: string, taxYear: number): Promise<Price | null> {
    if (!this.provider) return null
    try {
      return await this.provider.priceOf(await this.requiredTier(userId, taxYear))
    } catch {
      return null
    }
  }

  /**
   * One payable session per year and tier (API-4): a paid year is refused, an open session is handed out
   * again, a session paid before its webhook is recorded here, and a new one is only created when none is
   * left. The provider gets one idempotency key per attempt, so two tabs at once, or a retry after the
   * local row could not be written, get the same session; a paid session without a row is rebuilt by the
   * webhook from the session's metadata.
   */
  async startCheckout(userId: string, taxYear: number, now = new Date()): Promise<{ checkoutUrl: string }> {
    if (!this.provider) {
      throw new UnavailableError('PAYMENT_NOT_CONFIGURED', 'Payment is not configured in this environment.')
    }
    const tier = await this.requiredTier(userId, taxYear)
    if (await this.repository.isPaid(userId, taxYear, tier)) throw alreadyPaid()
    for (const sessionId of await this.repository.openSessions(userId, taxYear, tier)) {
      const found = await this.provider.lookupCheckout(sessionId)
      if (found.state === 'open') return { checkoutUrl: found.url }
      if (found.state === 'paid') {
        await this.repository.markPaid(sessionId, found.amountCents, now)
        throw alreadyPaid()
      }
      if (found.state === 'pending') {
        throw new ConflictError('PAYMENT_PENDING', 'Eine Zahlung für dieses Steuerjahr wird noch bestätigt.')
      }
      await this.repository.markClosed(sessionId)
    }
    // The self-employed come back to the fill-in help they paid for, everyone else to the printout.
    const returnTrip = tier === 'selbststaendig' ? `${this.webAppUrl}/app/steuerjahr/${taxYear}/selbststaendig/elster` : `${this.webAppUrl}/app/steuerjahr/${taxYear}/ausdruck`
    const attempt = await this.repository.countSessions(userId, taxYear, tier)
    let session
    try {
      session = await this.provider.createCheckout({
        userId,
        taxYear,
        tier,
        successUrl: paymentReturnUrl(returnTrip, PAYMENT_RETURN.success),
        cancelUrl: paymentReturnUrl(returnTrip, PAYMENT_RETURN.cancel),
        idempotencyKey: `checkout:${userId}:${taxYear}:${tier}:${attempt}`,
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

  /** Signature-checked; each event stores one fact, so their order and a redelivery do not matter (`unlock-lifecycle.ts`). */
  async processWebhook(rawData: Buffer | undefined, signature: string | undefined, now = new Date()): Promise<void> {
    if (!this.provider) throw new UnavailableError('PAYMENT_NOT_CONFIGURED', 'Payment is not configured in this environment.')
    if (!rawData || !signature) throw new UnauthenticatedError('WEBHOOK_SIGNATURE_MISSING', 'The webhook signature is missing.')
    let event
    try {
      event = await this.provider.verifyEvent(rawData, signature)
    } catch (error) {
      if (error instanceof PaymentProviderUnavailableError) {
        throw new UnavailableError('PAYMENT_PROVIDER_UNAVAILABLE', 'The payment provider could not be reached; the event will be redelivered.')
      }
      throw new UnauthenticatedError('WEBHOOK_SIGNATURE_INVALID', 'The webhook signature is invalid.')
    }
    // Signed by the provider, keyed by its session id: the row may be any account's (P11). Only after the check.
    const verified = event
    await withSystemDatabaseAccess('payment-webhook', async () => {
      switch (verified.kind) {
        case 'bezahlt':
          await this.repository.markPaid(verified.sessionId, verified.amountCents, now, verified.owner)
          return
        case 'zurueckgenommen':
          await this.repository.revoke(verified.sessionId, verified.reason, verified.owner)
          return
        case 'wiederhergestellt':
          await this.repository.restore(verified.sessionId, verified.owner)
          return
        case 'geschlossen':
          await this.repository.markClosed(verified.sessionId)
          return
        case 'ignoriert':
          return
      }
    })
  }
}

function alreadyPaid(): ConflictError {
  return new ConflictError('ALREADY_PAID', 'Dieses Steuerjahr ist schon freigeschaltet.')
}
