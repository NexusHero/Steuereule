import { amountFromAnswer, type Answers } from '../interview/interview'
import { isSupportedIncomeTaxYear } from '../math/tarif'
import { getTaxYearParameters, type ReasonableBurdenParameters } from '../math/tax-parameters'

export type BurdenFiling = 'einzel' | 'zusammen'
export type BurdenChildrenBracket = '0' | '1-2' | '3+'

/** § 33 Abs. 3 EStG, stufenweise nach BFH VI R 75/14. */
export interface ExtraordinaryBurdenInput {
  readonly year: number
  /** Gesamtbetrag der Einkünfte (GdE) in Euro. */
  readonly gdeEur: number
  /** Selbst getragene Krankheitskosten nach Kassen-Erstattung in Euro. */
  readonly expensesEur: number
  readonly filing: BurdenFiling
  /** Anzahl berücksichtigungsfähiger Kinder (optional falls childrenBracket genutzt wird). */
  readonly childrenCount?: number
  readonly childrenBracket?: BurdenChildrenBracket
}

export interface ExtraordinaryBurdenResult {
  readonly reasonableBurdenCents: number
  readonly reasonableBurdenEur: number
  readonly deductibleCents: number
  readonly deductibleEur: number
}

const DEFAULT_BURDEN_PARAMS: ReasonableBurdenParameters = {
  tier1MaxGdeEur: 15340,
  tier2MaxGdeEur: 51130,
  rates: {
    singleNoChildren: [0.05, 0.06, 0.07],
    jointNoChildren: [0.04, 0.05, 0.06],
    oneOrTwoChildren: [0.02, 0.03, 0.04],
    threeOrMoreChildren: [0.01, 0.01, 0.02],
  },
}

/**
 * § 33 Abs. 3 EStG: Kinderzahl aus der Interview-Antwort `kinder`.
 * `2 oder mehr` maps to `1-2` per Product Owner ruling because Minimal-Gate does not distinguish 2 from 3+.
 * Children recorded for the year know better: with three or more the rates for `3+` apply (ADR-0087).
 */
export function burdenChildrenBracket(kinderAnswer: string | undefined, recordedChildren = 0): BurdenChildrenBracket {
  if (recordedChildren >= 3) return '3+'
  if (recordedChildren >= 1) return '1-2'
  if (kinderAnswer === '1 Kind' || kinderAnswer === '2 oder mehr') return '1-2'
  return '0'
}

function resolveBracket(input: ExtraordinaryBurdenInput): BurdenChildrenBracket {
  if (input.childrenBracket !== undefined) return input.childrenBracket
  const count = input.childrenCount ?? 0
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError('childrenCount must be a non-negative integer')
  }
  if (count >= 3) return '3+'
  if (count >= 1) return '1-2'
  return '0'
}

function ratesFor(
  params: ReasonableBurdenParameters,
  filing: BurdenFiling,
  bracket: BurdenChildrenBracket,
): readonly [number, number, number] {
  if (bracket === '3+') return params.rates.threeOrMoreChildren
  if (bracket === '1-2') return params.rates.oneOrTwoChildren
  return filing === 'zusammen' ? params.rates.jointNoChildren : params.rates.singleNoChildren
}

/** § 33 Abs. 3 EStG (stufenweise nach BFH VI R 75/14): Berechnet zumutbare Belastung & abziehbaren Betrag. */
export function calculateExtraordinaryBurden(input: ExtraordinaryBurdenInput): ExtraordinaryBurdenResult {
  if (!Number.isFinite(input.gdeEur) || input.gdeEur < 0) {
    throw new RangeError('gdeEur must be a non-negative finite number')
  }
  if (!Number.isFinite(input.expensesEur) || input.expensesEur < 0) {
    throw new RangeError('expensesEur must be a non-negative finite number')
  }

  const params = isSupportedIncomeTaxYear(input.year)
    ? getTaxYearParameters(input.year).reasonableBurden
    : DEFAULT_BURDEN_PARAMS
  const [rate1, rate2, rate3] = ratesFor(params, input.filing, resolveBracket(input))

  const gdeCents = Math.round(input.gdeEur * 100)
  const tier1LimitCents = Math.round(params.tier1MaxGdeEur * 100)
  const tier2LimitCents = Math.round(params.tier2MaxGdeEur * 100)

  const tier1Base = Math.min(gdeCents, tier1LimitCents)
  const tier2Base = Math.max(0, Math.min(gdeCents, tier2LimitCents) - tier1LimitCents)
  const tier3Base = Math.max(0, gdeCents - tier2LimitCents)

  const burdenCents =
    Math.round(tier1Base * rate1) + Math.round(tier2Base * rate2) + Math.round(tier3Base * rate3)
  const expensesCents = Math.round(input.expensesEur * 100)
  const deductibleCents = Math.max(0, expensesCents - burdenCents)

  return {
    reasonableBurdenCents: burdenCents,
    reasonableBurdenEur: burdenCents / 100,
    deductibleCents,
    deductibleEur: deductibleCents / 100,
  }
}

export function extraordinaryBurdenFromAnswers(answers: Answers): number {
  if (answers['gesundheit-gate'] !== 'Ja') return 0
  return amountFromAnswer(answers['gesundheit-betrag']) ?? 0
}
