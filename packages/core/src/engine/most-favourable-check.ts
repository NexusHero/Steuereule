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

function personalTax(input: MostFavourableCheckInput, year: IncomeTaxYear, factor: ChurchTaxFactor): number {
  const { kapitalertraege, remainingZvE, assessmentType } = input
  const exemptionLimit = assessmentType === 'einzel' ? soliExemptionLimits(year).single : soliExemptionLimits(year).joint

  const incomeTaxWith = tariffOnBasis(remainingZvE + kapitalertraege, assessmentType, year)
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
  const flatRateTaxAmount = Math.floor(params.capital.flatRateTaxRate * assessmentBase)

  const soliExemptionLimit = assessmentType === 'einzel' ? params.soliLimits.single : params.soliLimits.joint
  const soliFlatRate = solidaritaetszuschlag(flatRateTaxAmount, soliExemptionLimit)

  const churchTaxFlatRate = kirchensteuer(flatRateTaxAmount, factor)
  const reduction = Math.floor(params.capital.churchTaxReductionShare * churchTaxFlatRate)
  const flatRateTax = flatRateTaxAmount - reduction + churchTaxFlatRate + soliFlatRate

  const personal = personalTax(input, year, factor)

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
