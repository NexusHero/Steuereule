import { Logger } from '@nestjs/common'
import { OWN_FIRST_BUSINESS } from '../business/business.repository.js'
import {
  ENTRY_RULE_CODES,
  PERSON_B_HANDLE,
  provenanceKey,
  type AdvisorEstimateLine,
  type AdvisorEstimateReading,
  type AdvisorHousehold,
  type AdvisorPreviewEffect,
  type AdvisorPreviewTarget,
  type AdvisorRecordHandles,
  type CaseDigest,
} from '@steuereule/core'
import { HOUSEHOLD_AND_HEALTH_BOOSTERS } from '../config/features.js'
import { ConfirmationService } from '../confirmation/confirmation.service.js'
import { checkPiiFree } from '../ki/ki.adapter.js'
import { LinkService } from '../link/link.service.js'
import { PrintoutService } from '../printout/printout.service.js'
import { passThroughTransactionRunner, type TransactionRunner } from '../common/transaction-runner.js'
import { type ReceiptRepository } from '../receipt/receipt.repository.js'
import { TaxEstimateService, type TaxEstimateStatus } from '../tax-estimate/tax-estimate.service.js'
import type { BusinessService } from '../business/business.service.js'
import { type AdvisorRepository } from './advisor.repository.js'
import { AdvisorCaseFacts } from './advisor-case-facts.js'
import { AdvisorDrafts } from './advisor-drafts.js'
import { describePrintoutGap } from './advisor-printout-gaps.js'
import { buildPrintoutPlan } from './advisor-printout-plan.js'
import { buildReceiptInbox } from './advisor-receipt-inbox.js'
import { effectLeftOutOfEstimate } from './advisor-shared.js'

/** Thrown on purpose at the end of an effect preview: the transaction must never commit. */
class PreviewRollback extends Error {}

const midpoint = (state: Extract<TaxEstimateStatus, { kind: 'spanne' }>): number => Math.round((state.result.from + state.result.to) / 2)

/** Turns the two estimates of a preview into what the draft card says; honest when there is no figure. */
/** The app's estimate as the owl reads it (`read_current_estimate`): the amounts, never a name or an id. */
export function estimateReadingFrom(status: TaxEstimateStatus): AdvisorEstimateReading {
  if (status.kind === 'offen') return { kind: 'open', missing: status.missing }
  if (status.kind === 'nicht-moeglich') return { kind: 'not-possible', reason: status.reason }
  const range = (value: { readonly from: number; readonly to: number }) => ({ fromEur: value.from, toEur: value.to })
  return {
    kind: 'computed',
    result: range(status.result),
    workExpensesEur: status.werbungskosten,
    provision: range(status.provision),
    specialExpensesEur: status.specialExpenses,
    taxableIncome: range(status.taxableIncome),
    incomeTax: range(status.incomeTax),
    solidaritySurcharge: range(status.solidaritaetszuschlag),
    creditedTaxEur: status.anrechnung,
    prepaymentsEur: status.prepayments ?? 0,
    churchTaxOpen: status.churchTaxOpen,
    jointAssessment: status.jointAssessment === true,
    breakdown: estimateLines(status),
    rangeCauses: rangeCausesOf(status),
  }
}

const EUR = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 })

/** Why the estimate's result is a range, from what the estimate itself holds; nothing for a point value. */
function rangeCausesOf(status: Extract<TaxEstimateStatus, { kind: 'spanne' }>): string[] {
  if (status.result.from === status.result.to) return []
  const causes: string[] = []
  if (status.provision.from !== status.provision.to) {
    causes.push(
      `Die abziehbaren Vorsorgeaufwendungen sind eine Spanne von ${EUR.format(status.provision.from)} bis ${EUR.format(status.provision.to)} €: Die App kennt den genauen abziehbaren Anteil der Beiträge noch nicht (z. B. Zusatzbeitrag, Kinderlosenzuschlag oder Höchstbetrag der sonstigen Vorsorge).`,
    )
  }
  if (status.laterAmounts) causes.push(`${status.laterAmounts} ${status.laterAmounts === 1 ? 'Betrag ist' : 'Beträge sind'} mit „Später eintragen“ markiert und noch nicht gerechnet.`)
  if (status.churchTax && 'due' in status.churchTax && status.churchTax.due.from !== status.churchTax.due.to) causes.push('Die Kirchensteuer ist eine Spanne (Hebesatz oder Kappung noch offen).')
  if (status.churchTaxOpen) causes.push('Die Kirchensteuer ist noch nicht gerechnet, weil ihre Angaben fehlen.')
  if (status.incomeTax.from !== status.incomeTax.to && causes.length === 0) causes.push('Die Einkommensteuer ist eine Spanne, weil das zu versteuernde Einkommen noch eine Spanne ist.')
  return causes
}

/**
 * The estimate's calculation as lines the owl quotes (real-data run: its own table took the § 35a
 * reduction off the income tax a second time). The figures are the estimate's, none is computed here;
 * a step the estimate does not name is left out.
 */
function estimateLines(status: Extract<TaxEstimateStatus, { kind: 'spanne' }>): AdvisorEstimateLine[] {
  const line = (label: string, value: number | { readonly from: number; readonly to: number }): AdvisorEstimateLine =>
    typeof value === 'number' ? { label, amountEur: value } : value.from === value.to ? { label, amountEur: value.from } : { label, fromEur: value.from, toEur: value.to }
  const steps = status.breakdown
  const child = steps?.childAllowance
  const persons = steps?.persons ?? []
  const who = (index: number) => (persons.length > 1 ? ` Person ${index === 0 ? 'A' : 'B'}` : '')
  return [
    ...persons.flatMap((person, i) => [line(`Einkünfte${who(i)} (nach Werbungskosten)`, person.incomeEur), line(`Werbungskosten${who(i)}`, person.workExpensesEur)]),
    ...(steps?.rentalSurplusEur !== undefined ? [line('Einkünfte aus Vermietung', steps.rentalSurplusEur)] : []),
    ...(steps ? [line('Summe der Einkünfte', steps.totalIncomeEur)] : []),
    line('Vorsorgeaufwendungen (abziehbar)', status.provision),
    line('Sonderausgaben', status.specialExpenses),
    ...(steps && steps.extraordinaryBurdenEur > 0 ? [line('Außergewöhnliche Belastungen (abziehbar)', steps.extraordinaryBurdenEur)] : []),
    ...(child?.used ? [line('Kinderfreibeträge (angesetzt)', child.allowanceEur)] : []),
    line('Zu versteuerndes Einkommen', status.taxableIncome),
    ...(steps ? [line('Tarifliche Einkommensteuer', steps.tariffTax), line('Steuerermäßigung § 35a EStG (schon abgezogen)', -steps.householdReductionEur)] : []),
    ...(child?.used ? [line('Hinzugerechnetes Kindergeld', child.childBenefitEur)] : []),
    ...(steps?.capitalFlatTaxEur !== undefined ? [line('Abgeltungsteuer auf Kapitalerträge', steps.capitalFlatTaxEur)] : []),
    line('Festzusetzende Einkommensteuer', status.incomeTax),
    line('Solidaritätszuschlag', status.solidaritaetszuschlag),
    line('Angerechnete Steuer (Lohnsteuer, Quellensteuer)', status.anrechnung),
    line('Vorauszahlungen', status.prepayments ?? 0),
    line('Ergebnis (positiv = Erstattung, negativ = Nachzahlung)', status.result),
  ]
}

export function effectFromEstimates(states: { readonly before: TaxEstimateStatus; readonly after: TaxEstimateStatus } | null): AdvisorPreviewEffect {
  if (states === null) return { kind: 'not-computable', hint: 'Die Wirkung lässt sich gerade nicht berechnen.' }
  const { before, after } = states
  if (before.kind === 'spanne' && after.kind === 'spanne') {
    const beforeRefundEur = midpoint(before)
    const afterRefundEur = midpoint(after)
    return { kind: 'computed', beforeRefundEur, afterRefundEur, deltaEur: afterRefundEur - beforeRefundEur }
  }
  if (after.kind === 'spanne') {
    return { kind: 'not-computable', hint: 'Mit dieser Angabe wird die Schätzung erstmals möglich; einen Unterschied zu vorher gibt es deshalb noch nicht.' }
  }
  if (after.kind === 'offen') {
    return { kind: 'not-computable', hint: 'Wirkung erst berechenbar, wenn die Angaben für die Schätzung vollständig sind (z. B. die Lohnsteuerbescheinigung).' }
  }
  return { kind: 'not-computable', hint: 'Für deine Lebenslage gibt es noch keine automatische Schätzung; die Wirkung kann ich deshalb nicht beziffern.' }
}

/**
 * What the owl knows about the case: the digest of the return with the receipt inbox and the
 * printout's gaps, the household, the record handles, and the app's own estimate and effect preview.
 */
export class AdvisorCaseDigest {
  private readonly logger = new Logger('AdvisorTurn')

  constructor(
    private readonly advisorRepo: AdvisorRepository,
    private readonly confirmationService: ConfirmationService,
    private readonly facts: AdvisorCaseFacts,
    private readonly drafts: AdvisorDrafts,
    private readonly transactions: TransactionRunner,
    private readonly hasPersonalDataConsent: (userId: string) => Promise<boolean>,
    private readonly link: LinkService | undefined,
    private readonly printout: PrintoutService | undefined,
    private readonly receiptRepo: ReceiptRepository | undefined,
    private readonly taxEstimate: TaxEstimateService | undefined,
    /** The book of the self-employed (ADR-0101); absent where the owl runs without it. */
    private readonly business?: BusinessService | undefined,
  ) {}

  /** Every name that must not reach a model: the user's, the children's and the spouse's. */
  async knownNamesForScrubbing(userId: string, taxYear: number): Promise<string[]> {
    const [own, spouse] = await Promise.all([this.facts.knownNamesForScrubbing(userId, taxYear), this.link?.spouseForAdvisor(userId, taxYear)])
    return [...own, ...[spouse?.firstName, spouse?.lastName].filter((name): name is string => !!name)]
  }

  /**
   * The household as the owl may know it (ADR-0073): whether there is a Person B, whether the user
   * records B's figures, and B's figures already entered. No name, no id for the model: B's names
   * only travel as `aliases`, which the tool round checks draft titles against.
   */
  async advisorHousehold(userId: string, taxYear: number): Promise<AdvisorHousehold> {
    const spouse = await this.link?.spouseForAdvisor(userId, taxYear)
    if (!spouse) return { personB: null }
    return {
      personB: {
        handle: PERSON_B_HANDLE,
        recordable: spouse.recordable,
        figures: spouse.recordable ? await this.facts.personBFigures(spouse.spouseUserId, taxYear) : null,
        // Only to check a draft's title against (ADR-0073 Nachtrag); never part of a prompt.
        aliases: spouseAliases(spouse.firstName, spouse.lastName),
      },
    }
  }

  async loadRecordHandles(userId: string, taxYear: number): Promise<AdvisorRecordHandles> {
    return this.facts.loadRecordHandles(userId, taxYear)
  }

  async buildCaseDigest(userId: string, taxYear: number): Promise<CaseDigest> {
    const withInbox = await this.withReceiptInbox(userId, taxYear, await this.facts.buildCaseDigest(userId, taxYear))
    return this.withBusiness(userId, taxYear, await this.withPrintoutGaps(userId, taxYear, withInbox))
  }

  /** A short business summary (ADR-0101): profit so far, VAT balance, open bank items, the book's frame. */
  private async withBusiness(userId: string, taxYear: number, digest: CaseDigest): Promise<CaseDigest> {
    if (!this.business) return digest
    try {
      const [summary, target] = await Promise.all([this.business.digest(userId, taxYear), this.business.bookingTarget(userId, taxYear, OWN_FIRST_BUSINESS)])
      if (summary === null) return digest
      return {
        ...digest,
        business: {
          kind: summary.kind === 'freiberuf' || summary.kind === 'gewerbe' ? summary.kind : null,
          mode: target.mode,
          chart: target.chart,
          lockedThrough: target.lockedThrough,
          smallBusiness: target.smallBusiness,
          profitSoFarEur: summary.profitSoFarEur,
          vatBalanceEur: summary.vatBalanceEur,
          openBankItems: summary.openBankItems,
        },
      }
    } catch (error) {
      this.logger.warn(`business summary for the digest failed: ${error instanceof Error ? error.name : 'unknown'}`)
      return digest
    }
  }

  /** The stored Belege of the year, as far as the owl may know them (no file names). A failing read leaves the digest as it was. */
  private async withReceiptInbox(userId: string, taxYear: number, digest: CaseDigest): Promise<CaseDigest> {
    if (!this.receiptRepo || !digest.furtherFacts) return digest
    try {
      const [records, messages] = await Promise.all([this.receiptRepo.findAllForUser(userId), this.advisorRepo.listForUserAndYear(userId, taxYear)])
      const drafts = messages.flatMap((m) => [...(m.meta?.action ? [m.meta.action] : []), ...(m.meta?.actions ?? [])])
      const receiptInbox = buildReceiptInbox(records, taxYear, drafts)
      checkPiiFree(receiptInbox)
      return receiptInbox.total === 0 ? digest : { ...digest, furtherFacts: { ...digest.furtherFacts, receiptInbox } }
    } catch (error: unknown) {
      this.logger.warn(`receipt inbox skipped: ${error instanceof Error ? error.name : 'error'}`)
      return digest
    }
  }

  private async withPrintoutGaps(userId: string, taxYear: number, digest: CaseDigest): Promise<CaseDigest> {
    if (!this.printout || !digest.furtherFacts) return digest
    let missing: string[]
    try {
      missing = (await this.printout.check(userId, taxYear)).missing
    } catch {
      // A year without forms has no printout to check.
      return digest
    }
    // The fixed rules (ADR-0093) are asked with the printout's gaps; they stay out of `printoutGaps`,
    // which names only what blocks the printout.
    const printoutPlan = await this.printoutPlan(userId, taxYear, [...missing, ...ENTRY_RULE_CODES]).catch((error: unknown) => {
      this.logger.warn(`printout plan failed: ${error instanceof Error ? error.name : 'error'}`)
      return undefined
    })
    return { ...digest, furtherFacts: { ...digest.furtherFacts, printoutGaps: missing.map(describePrintoutGap), ...(printoutPlan ? { printoutPlan } : {}) } }
  }

  /** What closes each printout gap, per person, child or object (ADR-0091, Nachtrag). */
  private async printoutPlan(userId: string, taxYear: number, missing: readonly string[]) {
    const [spouse, records, consent] = await Promise.all([this.link?.spouseForAdvisor(userId, taxYear), this.loadRecordHandles(userId, taxYear), this.hasPersonalDataConsent(userId)])
    return buildPrintoutPlan({
      userId,
      taxYear,
      missing,
      spouse: spouse ? { spouseUserId: spouse.spouseUserId, recordable: spouse.recordable } : null,
      records,
      personalDataConsent: consent,
      read: (dataUserId, year, keys) => this.confirmationService.readRawValues(dataUserId, year, keys),
    })
  }

  /**
   * What a draft would do to the refund, by the app's own estimate: once for the stored return,
   * once with the draft's fields written — inside a transaction that is always rolled back, so
   * the preview runs through the very write path „Übernehmen“ uses and leaves nothing behind.
   * Only offered where a real transaction exists; in-memory setups keep the approximation.
   */
  previewEffectFor(userId: string, taxYear: number): ((target: AdvisorPreviewTarget) => Promise<AdvisorPreviewEffect>) | undefined {
    const estimate = this.taxEstimate
    if (!estimate || this.transactions === passThroughTransactionRunner) return undefined
    return async (target) => {
      // The estimate leaves § 35a and § 33 out while their boosters are off (#443 slice 5): a draft
      // there would show 0 € and read as "brings nothing", which is not true.
      const leftOut = effectLeftOutOfEstimate(target, HOUSEHOLD_AND_HEALTH_BOOSTERS)
      if (leftOut) return leftOut
      let states: { before: TaxEstimateStatus; after: TaxEstimateStatus } | null = null
      try {
        // Person B's fields are written where B's data lives; the estimate is the couple's, read for the user.
        const dataUserId = await this.drafts.dataUserFor(userId, taxYear, target)
        const personalDataConsent = await this.hasPersonalDataConsent(userId)
        await this.transactions.run(async () => {
          const before = await estimate.getState(userId, taxYear)
          for (const [field, value] of target.values) {
            await this.confirmationService.writeConfirmedByAdvisor(dataUserId, taxYear, provenanceKey(target.screen, field, target.instance ?? undefined), value, undefined, undefined, { personalDataConsent })
          }
          states = { before, after: await estimate.getState(userId, taxYear) }
          throw new PreviewRollback()
        })
      } catch (error) {
        if (!(error instanceof PreviewRollback)) {
          this.logger.warn(`effect preview failed for ${target.screen}: ${error instanceof Error ? error.message.slice(0, 200) : String(error)}`)
          return { kind: 'not-computable', hint: 'Die Wirkung lässt sich gerade nicht berechnen.' }
        }
      }
      return effectFromEstimates(states)
    }
  }

  /** The app's own estimate of the year for the owl to read (`read_current_estimate`): figures only. */
  estimateReaderFor(userId: string, taxYear: number): (() => Promise<AdvisorEstimateReading>) | undefined {
    const estimate = this.taxEstimate
    if (!estimate) return undefined
    return async () => estimateReadingFrom(await estimate.getState(userId, taxYear))
  }
}

/** How a user may call the spouse in a chat: the first name and the full name, as stored in B's profile. */
function spouseAliases(firstName: string | null, lastName: string | null): string[] {
  const first = firstName?.trim() ?? ''
  const full = [first, lastName?.trim() ?? ''].filter((part) => part.length > 0).join(' ')
  return [...new Set([first, full].filter((name) => name.length > 0))]
}
