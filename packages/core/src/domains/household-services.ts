import { amountFromAnswer, type Answers } from '../interview/interview'
import { isSupportedIncomeTaxYear } from '../math/tarif'
import { getTaxYearParameters, type HouseholdServicesParameters } from '../math/tax-parameters'

/**
 * § 35a EStG — Steuerermäßigung für haushaltsnahe Beschäftigungsverhältnisse,
 * haushaltsnahe Dienstleistungen / Pflege und Handwerkerleistungen.
 */
export interface HouseholdServicesInput {
  readonly year: number
  /** § 35a Abs. 1 EStG: Aufwendungen für geringfügig Beschäftigte im Haushalt (in Euro). */
  readonly minijobEur?: number
  /** § 35a Abs. 2 EStG: Arbeitskosten für haushaltsnahe Dienstleistungen & Pflege (in Euro). */
  readonly servicesEur?: number
  /** § 35a Abs. 3 EStG: Arbeitskosten für Handwerkerleistungen (in Euro). */
  readonly craftsmenEur?: number
}

export interface HouseholdServicesReduction {
  readonly minijobReductionCents: number
  readonly servicesReductionCents: number
  readonly craftsmenReductionCents: number
  readonly totalReductionCents: number
  readonly minijobReductionEur: number
  readonly servicesReductionEur: number
  readonly craftsmenReductionEur: number
  readonly totalReductionEur: number
}

const DEFAULT_PARAMS: HouseholdServicesParameters = {
  minijobRate: 0.2,
  minijobMaxEur: 510,
  servicesRate: 0.2,
  servicesMaxEur: 4000,
  craftsmenRate: 0.2,
  craftsmenMaxEur: 1200,
}

function validateNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`householdServices: "${name}" must be a non-negative finite number`)
  }
}

function capCents(amountEur: number, rate: number, maxEur: number): number {
  const amountCents = Math.round(amountEur * 100)
  const rawReductionCents = Math.round(amountCents * rate)
  const maxCents = Math.round(maxEur * 100)
  return Math.min(maxCents, rawReductionCents)
}

/** § 35a EStG: 20 % je Absatz bis zum gesetzlichen Höchstbetrag (in Cent gerechnet). */
export function calculateHouseholdServicesReduction(input: HouseholdServicesInput): HouseholdServicesReduction {
  const minijobEur = input.minijobEur ?? 0
  const servicesEur = input.servicesEur ?? 0
  const craftsmenEur = input.craftsmenEur ?? 0
  validateNonNegative('minijobEur', minijobEur)
  validateNonNegative('servicesEur', servicesEur)
  validateNonNegative('craftsmenEur', craftsmenEur)

  const params = isSupportedIncomeTaxYear(input.year)
    ? getTaxYearParameters(input.year).householdServices
    : DEFAULT_PARAMS

  const minijobReductionCents = capCents(minijobEur, params.minijobRate, params.minijobMaxEur)
  const servicesReductionCents = capCents(servicesEur, params.servicesRate, params.servicesMaxEur)
  const craftsmenReductionCents = capCents(craftsmenEur, params.craftsmenRate, params.craftsmenMaxEur)
  const totalReductionCents = minijobReductionCents + servicesReductionCents + craftsmenReductionCents

  return {
    minijobReductionCents,
    servicesReductionCents,
    craftsmenReductionCents,
    totalReductionCents,
    minijobReductionEur: minijobReductionCents / 100,
    servicesReductionEur: servicesReductionCents / 100,
    craftsmenReductionEur: craftsmenReductionCents / 100,
    totalReductionEur: totalReductionCents / 100,
  }
}

/** § 35a EStG: Mindert die tarifliche Einkommensteuer, jedoch nie unter 0 €. */
export function applyHouseholdTaxReduction(incomeTaxEur: number, reductionEur: number): number {
  if (!Number.isFinite(incomeTaxEur) || incomeTaxEur < 0) {
    throw new RangeError('incomeTaxEur must be a non-negative finite number')
  }
  if (!Number.isFinite(reductionEur) || reductionEur < 0) {
    throw new RangeError('reductionEur must be a non-negative finite number')
  }
  const effectiveEur = Math.round(reductionEur)
  return Math.max(0, incomeTaxEur - effectiveEur)
}

export function householdServicesFromAnswers(answers: Answers, year: number): HouseholdServicesReduction {
  if (answers['haushalt-gate'] !== 'Ja') {
    return calculateHouseholdServicesReduction({ year })
  }
  return calculateHouseholdServicesReduction({
    year,
    servicesEur: amountFromAnswer(answers['haushalt-dienstleistung-betrag']) ?? 0,
    craftsmenEur: amountFromAnswer(answers['haushalt-handwerker-betrag']) ?? 0,
    minijobEur: amountFromAnswer(answers['haushalt-minijob-betrag']) ?? 0,
  })
}
