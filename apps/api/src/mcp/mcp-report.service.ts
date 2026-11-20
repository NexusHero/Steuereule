import { Inject, Injectable, Optional } from '@nestjs/common'
import { provenanceKey, QUESTIONS, type AdvisorEstimateReading, type EntryStepId } from '@steuereule/core'
import { estimateReadingFrom } from '../advisor/advisor-case-digest.js'
import { describePrintoutGap } from '../advisor/advisor-printout-gaps.js'
import { ConfirmationService } from '../confirmation/confirmation.service.js'
import { InterviewService } from '../interview/interview.service.js'
import { PrintoutService } from '../printout/printout.service.js'
import { TRANSACTION_RUNNER, type TransactionRunner } from '../prisma/transaction.js'
import { TaxEstimateService } from '../tax-estimate/tax-estimate.service.js'

/** Thrown on purpose at the end of a simulation: the transaction must never commit. */
class SimulationRollback extends Error {}

export interface AssistantReport {
  readonly taxYear: number
  readonly estimate: AdvisorEstimateReading | { readonly kind: 'unavailable' }
  readonly printout: { readonly ready: boolean; readonly gaps: readonly string[] }
  readonly unconfirmed: readonly { readonly annex: string; readonly count: number }[]
  readonly interview: { readonly openQuestions: number }
  readonly nextSteps: readonly string[]
}

export interface AssistantQuestion {
  readonly id: string
  readonly kind: 'question' | 'gate'
  readonly answers?: readonly string[]
}

export type SimulationResult =
  | { readonly ok: true; readonly beforeRefundEur: number; readonly afterRefundEur: number; readonly deltaEur: number }
  | { readonly ok: false; readonly reason: string }

const midpoint = (range: { readonly fromEur: number; readonly toEur: number }): number => Math.round((range.fromEur + range.toEur) / 2)

/**
 * What the user's assistant needs to tell its user how the return stands (ADR-0052 amendment 2):
 * the app's own estimate, what still blocks the printout, what the user has yet to confirm, the
 * questions only the user can answer, and what an entry would do to the refund. Figures and
 * labels only, never a name or an id of a person.
 */
@Injectable()
export class McpReportService {
  constructor(
    @Inject(TaxEstimateService) private readonly estimate: TaxEstimateService,
    @Inject(PrintoutService) private readonly printout: PrintoutService,
    @Inject(ConfirmationService) private readonly confirmation: ConfirmationService,
    @Inject(InterviewService) private readonly interview: InterviewService,
    @Optional() @Inject(TRANSACTION_RUNNER) private readonly transactions?: TransactionRunner,
  ) {}

  async report(userId: string, taxYear: number): Promise<AssistantReport> {
    const [estimate, gaps, overview, interview] = await Promise.all([
      this.estimate.getState(userId, taxYear).then(estimateReadingFrom, () => ({ kind: 'unavailable' as const })),
      this.printout.check(userId, taxYear).then((check) => check.missing, () => [] as string[]),
      this.confirmation.overview(userId, taxYear),
      this.interview.getState(userId, taxYear),
    ])
    const unconfirmed = overview.annexes.filter((annex) => annex.unconfirmed > 0).map((annex) => ({ annex: annex.annex, count: annex.unconfirmed }))
    const nextSteps: string[] = []
    if (interview.openItems > 0) nextSteps.push(`Das Interview hat noch ${interview.openItems} offene Frage(n): Nutzer fragen, dann mit maske_eintragen (Maske "interview") eintragen.`)
    if (gaps.length > 0) nextSteps.push('Für den Ausdruck fehlen noch Angaben (siehe "gaps"): erfassen oder den Nutzer darum bitten.')
    if (unconfirmed.length > 0) nextSteps.push('Alles, was du eingetragen hast, ist unbestätigt: Der Nutzer prüft und bestätigt es je Anlage in der App („Prüfen & bestätigen“).')
    if (gaps.length === 0 && unconfirmed.length === 0 && interview.openItems === 0) nextSteps.push('Alles erfasst und bestätigt: Der Nutzer kann den Ausdruck freischalten (zahllink_anfordern).')
    return {
      taxYear,
      estimate,
      printout: { ready: gaps.length === 0, gaps: gaps.map(describePrintoutGap) },
      unconfirmed,
      interview: { openQuestions: interview.openItems },
      nextSteps,
    }
  }

  /** The next step of the interview and what is left: the facts only the user can give. */
  async openQuestions(userId: string, taxYear: number): Promise<{ readonly openQuestions: number; readonly next: AssistantQuestion | null }> {
    const state = await this.interview.getState(userId, taxYear)
    const step = state.nextStep
    if (step.kind === 'done' || step.id === undefined) return { openQuestions: state.openItems, next: null }
    const form = QUESTIONS[step.id as EntryStepId]?.form
    const answers = form?.kind === 'enum' ? [...form.values] : undefined
    return { openQuestions: state.openItems, next: { id: step.id, kind: step.kind, ...(answers ? { answers } : {}) } }
  }

  /**
   * The refund before and after an entry, by the app's own estimate, through the very write path an
   * entry uses, inside a transaction that is always rolled back.
   */
  async simulate(userId: string, taxYear: number, screen: Parameters<typeof provenanceKey>[0], field: string, value: string, instance?: string): Promise<SimulationResult> {
    if (!this.transactions) return { ok: false, reason: 'Die Simulation steht in dieser Umgebung nicht zur Verfügung.' }
    let result: SimulationResult = { ok: false, reason: 'Die Wirkung lässt sich gerade nicht berechnen.' }
    try {
      await this.transactions.run(async () => {
        const before = estimateReadingFrom(await this.estimate.getState(userId, taxYear))
        await this.confirmation.writeConfirmedByAdvisor(userId, taxYear, provenanceKey(screen, field, instance), value, undefined, undefined, { personalDataConsent: true })
        const after = estimateReadingFrom(await this.estimate.getState(userId, taxYear))
        if (before.kind === 'computed' && after.kind === 'computed') {
          const beforeRefundEur = midpoint(before.result)
          const afterRefundEur = midpoint(after.result)
          result = { ok: true, beforeRefundEur, afterRefundEur, deltaEur: afterRefundEur - beforeRefundEur }
        } else if (after.kind === 'computed') {
          result = { ok: false, reason: 'Mit dieser Angabe wird die Schätzung erstmals möglich; einen Unterschied zu vorher gibt es noch nicht.' }
        } else {
          result = { ok: false, reason: 'Die Wirkung ist erst berechenbar, wenn die Angaben für die Schätzung vollständig sind (z. B. die Lohnsteuerbescheinigung).' }
        }
        throw new SimulationRollback()
      })
    } catch (error) {
      if (!(error instanceof SimulationRollback)) return { ok: false, reason: error instanceof Error ? error.message.slice(0, 200) : 'Die Wirkung lässt sich gerade nicht berechnen.' }
    }
    return result
  }
}
