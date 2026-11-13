import { filingTypeComparison, isSupportedIncomeTaxYear, kirchensteuer, mostFavourableCheck, progressionClauseTax, soliExemptionLimits, solidaritaetszuschlag, type ChurchTaxFactor, type ProgressionClauseInput } from '@steuereule/core'

export interface IncomeTaxInput {
  readonly year: number
  readonly taxableIncome: number
  readonly splitting: boolean
  readonly churchTaxRate: ChurchTaxFactor
  readonly extraDeduction: number
  /** Wage replacement benefits under the progression clause (§ 32b EStG); 0 for none. */
  readonly wageReplacementEur?: number | undefined
}

export interface IncomeTaxFigures {
  readonly taxableIncome: number
  readonly incomeTaxEur: number
  readonly soliEur: number
  readonly churchTaxEur: number
  readonly totalEur: number
}

export interface IncomeTaxResult extends IncomeTaxFigures {
  readonly year: number
  readonly assessment: 'single' | 'joint'
  /** Percent of the next 100 € that go to tax, church tax and Soli included. */
  readonly marginalRatePercent: number
  /** Only with `extraDeduction`: the same sum after the deduction, and what it saves. */
  readonly withDeduction?: IncomeTaxFigures | undefined
  readonly savingEur?: number | undefined
  /** Only with benefits under the progression clause: what the same income would cost without them. */
  readonly wageReplacementEur?: number | undefined
  readonly withoutBenefitsEur?: number | undefined
}

function figures(year: number, taxableIncome: number, splitting: boolean, churchTaxRate: ChurchTaxFactor, wageReplacementEur: number): IncomeTaxFigures {
  const zvE = Math.floor(taxableIncome)
  const incomeTaxEur = progressionClauseTax(zvE, wageReplacementEur, year, splitting)
  const limits = soliExemptionLimits(year as Parameters<typeof soliExemptionLimits>[0])
  const soliEur = solidaritaetszuschlag(incomeTaxEur, splitting ? limits.joint : limits.single)
  const churchTaxEur = kirchensteuer(incomeTaxEur, churchTaxRate)
  return { taxableIncome: zvE, incomeTaxEur, soliEur, churchTaxEur, totalEur: incomeTaxEur + soliEur + churchTaxEur }
}

/**
 * The tariff sum of the app's own tax core (§ 32a EStG, SolZG, church tax), for the owl to quote
 * instead of working it out herself. Null for a year the core has no tariff for.
 */
export function computeIncomeTax(input: IncomeTaxInput): IncomeTaxResult | null {
  if (!isSupportedIncomeTaxYear(input.year)) return null
  const benefits = input.wageReplacementEur ?? 0
  const base = figures(input.year, input.taxableIncome, input.splitting, input.churchTaxRate, benefits)
  const next = figures(input.year, input.taxableIncome + 100, input.splitting, input.churchTaxRate, benefits)
  const withDeduction = input.extraDeduction > 0 ? figures(input.year, Math.max(0, input.taxableIncome - input.extraDeduction), input.splitting, input.churchTaxRate, benefits) : undefined
  return {
    year: input.year,
    assessment: input.splitting ? 'joint' : 'single',
    ...base,
    ...(benefits > 0 ? { wageReplacementEur: Math.floor(benefits), withoutBenefitsEur: figures(input.year, input.taxableIncome, input.splitting, input.churchTaxRate, 0).totalEur } : {}),
    marginalRatePercent: next.totalEur - base.totalEur,
    ...(withDeduction ? { withDeduction, savingEur: base.totalEur - withDeduction.totalEur } : {}),
  }
}

/** Benefits under the progression clause as the comparisons take them: unknown is not the same as none. */
function progressionClauseOf(wageReplacementEur: number | undefined): ProgressionClauseInput {
  if (wageReplacementEur === undefined) return { kind: 'nicht-angegeben' }
  return wageReplacementEur > 0 ? { kind: 'lohnersatzleistungen', amount: Math.floor(wageReplacementEur) } : { kind: 'keine' }
}

export interface FilingTypesInput {
  readonly year: number
  readonly taxableIncomeA: number
  readonly taxableIncomeB: number
  readonly churchTaxRate: ChurchTaxFactor
  /** Of both spouses together; undefined while the owl has not asked. */
  readonly wageReplacementEur?: number | undefined
}

/**
 * Joint against separate assessment (§§ 26, 26a, 32a Abs. 5 EStG) with the app's own comparison.
 * `outcome`: `joint`/`separate` when the difference is larger than the progression clause can move
 * it, `too_close` when it is not, `open` while it is unknown whether there are benefits.
 */
export function compareFilingTypes(input: FilingTypesInput) {
  if (!isSupportedIncomeTaxYear(input.year)) return null
  const result = filingTypeComparison({ zveA: Math.floor(input.taxableIncomeA), zveB: Math.floor(input.taxableIncomeB), year: input.year, progressionClause: progressionClauseOf(input.wageReplacementEur), churchTaxFactor: input.churchTaxRate })
  const outcome = result.statement === 'eindeutig' ? (result.recommendation === 'zusammen' ? 'joint' : 'separate') : result.statement === 'zu-knapp' ? 'too_close' : 'open'
  return {
    year: input.year,
    outcome,
    separateTotalEur: result.single,
    jointTotalEur: result.joint,
    savingEur: Math.abs(result.delta),
    ...(result.uncertainty.kind === 'bestimmt' && result.uncertainty.upperLimit > 0 ? { progressionClauseUpToEur: result.uncertainty.upperLimit } : {}),
  }
}

export interface CapitalCheckInput {
  readonly year: number
  /** Capital income before the saver's allowance. */
  readonly capitalIncomeEur: number
  /** The rest of the taxable income, without the capital income. */
  readonly otherTaxableIncome: number
  readonly joint: boolean
  readonly churchTaxRate: ChurchTaxFactor
  readonly wageReplacementEur?: number | undefined
}

/**
 * Flat-rate tax against the personal rate on capital income (Günstigerprüfung, § 32d Abs. 6 EStG)
 * with the app's own check. `outcome`: `personal` or `flat_rate` when clear, `too_close`, or `open`.
 */
export function checkCapitalTaxation(input: CapitalCheckInput) {
  if (!isSupportedIncomeTaxYear(input.year)) return null
  const result = mostFavourableCheck({ kapitalertraege: Math.floor(input.capitalIncomeEur), remainingZvE: Math.floor(input.otherTaxableIncome), year: input.year, assessmentType: input.joint ? 'zusammen' : 'einzel', progressionClause: progressionClauseOf(input.wageReplacementEur), churchTaxFactor: input.churchTaxRate })
  const outcome = result.statement === 'eindeutig' ? (result.recommendation === 'persoenlich' ? 'personal' : 'flat_rate') : result.statement === 'zu-knapp' ? 'too_close' : 'open'
  return {
    year: input.year,
    outcome,
    flatRateTotalEur: result.flatRateTax,
    personalTotalEur: result.personal,
    savingEur: Math.abs(result.delta),
    saverAllowanceEur: result.provenance.saversAllowance,
  }
}
