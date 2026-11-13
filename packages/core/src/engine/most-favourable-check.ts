import { flatRateTaxWithChurchTax } from '../domains/church-tax'
import {
  incomeTax,
  isSupportedIncomeTaxYear,
  kirchensteuer,
  solidaritaetszuschlag,
  soliExemptionLimits,
  splittingTariff,
  type IncomeTaxYear,
  type ChurchTaxFactor,
} from '../math/tarif'
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
  const exemptionLimit = assessmentType === 'einzel' ? soliExemptionLimits(year).single : soliExemptionLimits(year).joint

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

  const soliExemptionLimit = assessmentType === 'einzel' ? params.soliLimits.single : params.soliLimits.joint
  const soliFlatRate = solidaritaetszuschlag(flatRateTaxAmount, soliExemptionLimit)

  const flatRateTax = flatRateTaxAmount + flatRate.churchTax + soliFlatRate

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
