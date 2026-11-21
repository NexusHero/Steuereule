import { flatRateTaxWithChurchTax } from '../domains/church-tax'
import {
  capitalFlatTax,
  incomeTax,
  isSupportedIncomeTaxYear,
  kirchensteuer,
  progressionClauseTax,
  solidaritaetszuschlag,
  solidaritaetszuschlagInCents,
  soliExemptionLimits,
  soliOnFlatTax,
  splittingTariff,
  type IncomeTaxYear,
  type ChurchTaxFactor,
} from '../math/tarif'
import type { Range } from './tax-estimate'
import { getTaxYearParameters } from '../math/tax-parameters'
import {
  progressionClauseLimit,
  type ProgressionClauseInput,
  type TariffComponent,
  type Uncertainty,
} from './filing-type-comparison'

export interface MostFavourableCheckInput {
  readonly kapitalertraege: number
  readonly remainingZvE: number
  readonly year: number
  readonly assessmentType: 'einzel' | 'zusammen'
  readonly progressionClause: ProgressionClauseInput
  readonly churchTaxFactor?: ChurchTaxFactor
}

/** Herkunfts-Metadaten an beiden Zahlen: beide tragen dieselben Eingaben und Bestandteile — die Unschärfe steckt im `unschaerfe`-Feld. */
export interface MostFavourableCheckSource {
  readonly kapitalertraege: number
  readonly remainingZvE: number
  readonly saversAllowance: number
  readonly assessmentType: 'einzel' | 'zusammen'
  readonly components: readonly TariffComponent[]
  /** On the estimate's figures: the lower end of its taxable income (`remainingZvE` is the upper end). */
  readonly remainingZvEFrom?: number
}

export type MostFavourableCheck =
  | {
      readonly statement: 'eindeutig'
      readonly recommendation: 'abgeltung' | 'persoenlich'
      readonly flatRateTax: number
      readonly personal: number
      readonly delta: number
      readonly uncertainty: Uncertainty
      readonly provenance: MostFavourableCheckSource
    }
  | {
      readonly statement: 'zu-knapp'
      readonly flatRateTax: number
      readonly personal: number
      readonly delta: number
      readonly uncertainty: Uncertainty
      readonly provenance: MostFavourableCheckSource
    }
  | {
      readonly statement: 'unbestimmt'
      readonly flatRateTax: number
      readonly personal: number
      readonly delta: number
      readonly uncertainty: Uncertainty
      readonly provenance: MostFavourableCheckSource
    }

function validate(input: MostFavourableCheckInput): void {
  if (!Number.isFinite(input.kapitalertraege) || !Number.isFinite(input.remainingZvE)) {
    throw new RangeError('kapitalertraege and uebrigesZvE must be finite numbers')
  }
  if (input.kapitalertraege < 0 || input.remainingZvE < 0) {
    throw new RangeError('kapitalertraege and uebrigesZvE must not be negative')
  }
  if (!Number.isInteger(input.kapitalertraege) || !Number.isInteger(input.remainingZvE)) {
    throw new RangeError('kapitalertraege and uebrigesZvE must be whole euros (integers)')
  }
}

function tariffOnBasis(basis: number, assessmentType: 'einzel' | 'zusammen', year: IncomeTaxYear): number {
  if (assessmentType === 'einzel') return incomeTax(basis, year)
  return splittingTariff(basis, 0, year)
}

/**
 * The tax the capital income costs at the personal rate. Under the check the saver's allowance is
 * deducted just as under the flat rate (§ 20 Abs. 9 EStG applies to all capital income): only the
 * rest is added to the taxable income.
 */
function personalTax(input: MostFavourableCheckInput, assessmentBase: number, year: IncomeTaxYear, factor: ChurchTaxFactor): number {
  const { remainingZvE, assessmentType } = input
  const soliLimits = getTaxYearParameters(year).soliLimits
  const exemptionLimit = assessmentType === 'einzel' ? soliLimits.single : soliLimits.joint

  const incomeTaxWith = tariffOnBasis(remainingZvE + assessmentBase, assessmentType, year)
  const incomeTaxWithout = tariffOnBasis(remainingZvE, assessmentType, year)
  const incomeTaxDifference = incomeTaxWith - incomeTaxWithout

  const soliDifference = solidaritaetszuschlag(incomeTaxWith, exemptionLimit) - solidaritaetszuschlag(incomeTaxWithout, exemptionLimit)
  const kist = kirchensteuer(incomeTaxDifference, factor)

  return incomeTaxDifference + soliDifference + kist
}

export function mostFavourableCheck(input: MostFavourableCheckInput): MostFavourableCheck {
  validate(input)
  const { kapitalertraege, remainingZvE, assessmentType, progressionClause } = input
  if (!isSupportedIncomeTaxYear(input.year)) {
    throw new RangeError(`Unsupported tax year for §32a EStG: ${input.year}`)
  }
  const year: IncomeTaxYear = input.year
  const factor = input.churchTaxFactor ?? 0
  const params = getTaxYearParameters(year)

  const saversAllowance = assessmentType === 'einzel' ? params.lumpSums.saverSingle : params.lumpSums.saverJoint
  const assessmentBase = Math.max(0, kapitalertraege - saversAllowance)
  // § 32d Abs. 1 Satz 4 EStG: ESt = e / (4 + k) — the church tax (k) is deducted inside the formula,
  // which is the same as lowering the 25 % by churchTaxReductionShare (25 %) of the church tax.
  const flatRate = flatRateTaxWithChurchTax(assessmentBase, factor)
  const flatRateTaxAmount = factor === 0 ? Math.floor(params.capital.flatRateTaxRate * assessmentBase) : flatRate.incomeTax

  // § 3 Abs. 3 Satz 2 SolZG: the tax under § 32d Abs. 1 is left out of the exemption limit, so its Soli is
  // 5,5 % from the first euro (as the estimate charges it); the limit applies on the tariff side only.
  const flatRateTax = cents(flatRateTaxAmount + flatRate.churchTax + soliOnFlatTax(flatRateTaxAmount) / 100)

  const personal = personalTax(input, assessmentBase, year, factor)

  const delta = personal - flatRateTax

  const components: TariffComponent[] =
    factor === 0 ? ['einkommensteuer', 'solidaritaetszuschlag'] : ['einkommensteuer', 'solidaritaetszuschlag', 'kirchensteuer']
  const provenance: MostFavourableCheckSource = {
    kapitalertraege,
    remainingZvE,
    saversAllowance,
    assessmentType,
    components,
  }

  const uncertainty = progressionClauseLimit(progressionClause)

  if (uncertainty.kind === 'unbestimmt') {
    return { statement: 'unbestimmt', flatRateTax, personal, delta, uncertainty, provenance }
  }
  if (Math.abs(delta) > uncertainty.upperLimit) {
    return {
      statement: 'eindeutig',
      recommendation: delta < 0 ? 'persoenlich' : 'abgeltung',
      flatRateTax,
      personal,
      delta,
      uncertainty,
      provenance,
    }
  }
  return { statement: 'zu-knapp', flatRateTax, personal, delta, uncertainty, provenance }
}

export interface EstimateCapitalCheckInput {
  readonly kapitalertraege: number
  readonly year: number
  /** The estimate's assessment: `zusammen` for a joint return (splitting tariff, 2.000 € allowance). */
  readonly assessmentType: 'einzel' | 'zusammen'
  /** The estimate's taxable income without the capital income (after the child allowance where it wins). */
  readonly taxableIncome: Range
  /** What the estimate put under the progression clause (§ 32b EStG); 0 = the plain tariff. */
  readonly progressionIncomeEur: number
  readonly churchTaxFactor?: ChurchTaxFactor
}

/** Keeps a sum of euro amounts with cents free of float noise. */
const cents = (value: number) => Math.round(value * 100) / 100

/**
 * § 32d Abs. 6 EStG on the figures of the Cockpit estimate: the tariff tax the capital income adds to
 * the estimate's taxable income (with it minus without it, on the estimate's tariff and § 32b income)
 * against the flat tax as the estimate charges it — 25 % plus 5,5 % Soli from the first euro (§ 3
 * Abs. 3 SolZG leaves the tax under § 32d out of the exemption limit). The Soli on the tariff side is
 * rounded as the estimate rounds it: to the cent for a couple, to the euro for a single person. Where
 * the estimate is a range, the figures are those of its upper end and the spread is the margin.
 */
export function mostFavourableCheckOnEstimate(input: EstimateCapitalCheckInput): MostFavourableCheck {
  const { kapitalertraege, assessmentType, taxableIncome } = input
  if (!Number.isInteger(kapitalertraege) || kapitalertraege < 0) throw new RangeError('kapitalertraege must be a non-negative whole euro amount')
  if (!isSupportedIncomeTaxYear(input.year)) throw new RangeError(`Unsupported tax year for §32a EStG: ${input.year}`)
  const year: IncomeTaxYear = input.year
  const factor = input.churchTaxFactor ?? 0
  const params = getTaxYearParameters(year)
  const joint = assessmentType === 'zusammen'
  const saversAllowance = joint ? params.lumpSums.saverJoint : params.lumpSums.saverSingle
  const base = Math.max(0, kapitalertraege - saversAllowance)

  const flat = factor === 0 ? { incomeTax: capitalFlatTax(base, year), churchTax: 0 } : flatRateTaxWithChurchTax(base, factor)
  const flatRateTax = cents(flat.incomeTax + flat.churchTax + soliOnFlatTax(flat.incomeTax) / 100)

  const progression = Math.max(0, input.progressionIncomeEur)
  const tariff = (z: number) =>
    progression > 0 ? progressionClauseTax(z, progression, year, joint) : joint ? splittingTariff(z, 0, year) : incomeTax(z, year)
  const limits = soliExemptionLimits(year)
  const soliInCents = (tax: number) => (joint ? solidaritaetszuschlagInCents(tax, limits.joint) : solidaritaetszuschlag(tax, limits.single) * 100)
  const personalAt = (z: number) => {
    const zvE = Math.max(0, z)
    const withCapital = tariff(zvE + base)
    const without = tariff(zvE)
    const difference = withCapital - without
    return cents(difference + (soliInCents(withCapital) - soliInCents(without)) / 100 + kirchensteuer(difference, factor))
  }
  const personal = personalAt(taxableIncome.to)
  const delta = cents(personal - flatRateTax)
  const uncertainty: Uncertainty = { kind: 'bestimmt', upperLimit: Math.ceil(Math.abs(personal - personalAt(taxableIncome.from))) }
  const provenance: MostFavourableCheckSource = {
    kapitalertraege,
    remainingZvE: taxableIncome.to,
    remainingZvEFrom: taxableIncome.from,
    saversAllowance,
    assessmentType,
    components: factor === 0 ? ['einkommensteuer', 'solidaritaetszuschlag'] : ['einkommensteuer', 'solidaritaetszuschlag', 'kirchensteuer'],
  }
  if (Math.abs(delta) > uncertainty.upperLimit) {
    return { statement: 'eindeutig', recommendation: delta < 0 ? 'persoenlich' : 'abgeltung', flatRateTax, personal, delta, uncertainty, provenance }
  }
  return { statement: 'zu-knapp', flatRateTax, personal, delta, uncertainty, provenance }
}
