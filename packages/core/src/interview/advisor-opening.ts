import { getTaxYearParameters } from '../math/tax-parameters'
import { isSupportedIncomeTaxYear } from '../math/tarif'
import { workAllowancesOf, type CaseDigest } from './advisor'

/**
 * How the owl opens a new conversation (ADR-0067 §11). The app decides the stage from the
 * figures before any model is asked, so an empty year costs nothing:
 *
 * - `empty`: nothing entered yet. No opening; the chat offers to start the interview.
 * - `partial`: something is there, but no income with an amount or no assessment. The owl says
 *   briefly what it knows and asks for the gaps as a round of tappable questions.
 * - `ready`: at least one income with an amount and the assessment. The owl analyses freely.
 */
export type AdvisorOpeningStage = 'empty' | 'partial' | 'ready'

const positive = (value: number | null | undefined): boolean => typeof value === 'number' && value > 0

/** Whether any kind of income has an amount: wage, Swiss wage, pension, capital, rent or a side job. */
export function hasIncomeWithAmount(digest: CaseDigest): boolean {
  const further = digest.furtherFacts
  return (
    positive(digest.lstbPersonA.grossWageEur) ||
    positive(digest.crossBorder.grossWageChf) ||
    positive(digest.capitalGainEur) ||
    positive(further?.pension?.annualEur) ||
    positive(further?.rentals.rentEur) ||
    positive(further?.sideJobGrossEur)
  )
}

export function advisorOpeningStage(digest: CaseDigest): AdvisorOpeningStage {
  const further = digest.furtherFacts
  const income = hasIncomeWithAmount(digest)
  const anything = income || (further?.answeredQuestions ?? 0) > 0 || digest.childrenCount > 0 || digest.rentalObjectsCount > 0
  if (!anything) return 'empty'
  return income && further?.filingStatusAnswered === true ? 'ready' : 'partial'
}

/** What is missing for an analysis, in words the owl turns into questions; empty when the stage is `ready`. */
export function openingGaps(digest: CaseDigest): string[] {
  const gaps: string[] = []
  if (!hasIncomeWithAmount(digest)) gaps.push('Einkommen mit Betrag (z. B. Bruttolohn aus der Lohnsteuerbescheinigung, Rente, Mieteinnahmen oder Kapitalerträge)')
  if (digest.furtherFacts?.filingStatusAnswered !== true) gaps.push('Veranlagung: allein oder zusammen mit Ehe- oder Lebenspartner')
  return gaps
}

/** Keys in a stable order, so the same case always gives the same text. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/**
 * A short fingerprint of what the owl knows about a year: the figures, the user's own description
 * and the notes. A new conversation opens with an analysis only when it differs from the one the
 * last opening was written for. FNV-1a over the stable JSON: enough to tell two states apart, and
 * nothing of the case can be read back from it.
 */
export function caseFingerprint(digest: CaseDigest, situation: string, notes: readonly string[]): string {
  const text = stableJson({ digest, situation: situation.trim(), notes: [...notes].map((note) => note.trim()) })
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/** One figure the app worked out before the owl opens: the only amounts the opening may name. */
export interface OpeningFigure {
  readonly id: string
  readonly label: string
  readonly amountEur: number
}

/** The app's own estimate of the year, where it can make one. Positive is a refund. */
export interface OpeningEstimate {
  readonly resultFromEur: number
  readonly resultToEur: number
  readonly incomeRelatedExpensesEur: number
}

/**
 * The figures of the opening, all from the app's calculation and none from the model (ADR-0067
 * §11): the estimate, the commute and home-office allowances, and the work expenses against the
 * lump sum. What is not entered stays out; nothing is assumed.
 */
export function openingFigures(digest: CaseDigest, estimate: OpeningEstimate | null): OpeningFigure[] {
  const figures: OpeningFigure[] = []
  const add = (id: string, label: string, amountEur: number) => figures.push({ id, label, amountEur: Math.round(amountEur) })
  if (estimate) {
    add('ergebnis-von', 'Voraussichtliches Ergebnis laut App, untere Grenze (positiv Erstattung, negativ Nachzahlung)', estimate.resultFromEur)
    add('ergebnis-bis', 'Voraussichtliches Ergebnis laut App, obere Grenze', estimate.resultToEur)
  }
  const work = workAllowancesOf(digest)
  if (work.commuteEur !== null && work.commuteEur > 0) add('entfernungspauschale', `Entfernungspauschale für ${work.commuteDays} Tage an der Arbeitsstätte`, work.commuteEur)
  if (work.homeOfficeEur > 0) add('homeoffice-pauschale', `Homeoffice-Tagespauschale für ${work.homeOfficeDays} Tage`, work.homeOfficeEur)
  if (isSupportedIncomeTaxYear(digest.taxYear)) {
    const lumpSum = getTaxYearParameters(digest.taxYear).lumpSums.employee
    add('arbeitnehmer-pauschbetrag', 'Arbeitnehmer-Pauschbetrag (gilt automatisch)', lumpSum)
    if (estimate) {
      add('werbungskosten', 'Werbungskosten laut App zusammen', estimate.incomeRelatedExpensesEur)
      add('werbungskosten-ueber-pauschbetrag', 'Werbungskosten über dem Pauschbetrag (nur dieser Teil wirkt zusätzlich)', Math.max(0, estimate.incomeRelatedExpensesEur - lumpSum))
    }
  }
  return figures
}

/** What the engine needs to open a conversation: the stage, the gaps and the figures. */
export interface AdvisorOpeningBrief {
  readonly stage: Exclude<AdvisorOpeningStage, 'empty'>
  readonly gaps: readonly string[]
  readonly figures: readonly OpeningFigure[]
  /** Set on the second attempt: the amounts the first one named without the app having computed them. */
  readonly unbackedAmounts?: readonly number[] | undefined
}
