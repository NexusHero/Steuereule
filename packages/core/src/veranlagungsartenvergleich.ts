import {
  incomeTax,
  isSupportedIncomeTaxYear,
  kirchensteuer,
  solidaritaetszuschlag,
  soliExemptionLimits,
  splittingTariff,
  type IncomeTaxYear,
  type ChurchTaxFactor,
} from './tarif'

export type ProgressionClauseInput =
  | { readonly art: 'keine' }
  | { readonly art: 'lohnersatzleistungen'; readonly amount: number }
  | { readonly art: 'nicht-angegeben' }

export type Uncertainty =
  | { readonly kind: 'bestimmt'; readonly upperLimit: number }
  | { readonly kind: 'unbestimmt'; readonly reason: 'progressionsvorbehalt-nicht-eingegeben' }

export type TariffComponent = 'einkommensteuer' | 'solidaritaetszuschlag' | 'kirchensteuer'

/** Herkunfts-Metadaten an beiden Zahlen. */
export interface ComparisonSource {
  readonly zveA: number
  readonly zveB: number
  readonly components: readonly TariffComponent[]
}

export type FilingTypeComparison =
  | {
      readonly statement: 'eindeutig'
      readonly recommendation: 'einzel' | 'zusammen'
      readonly single: number
      readonly joint: number
      readonly delta: number
      readonly uncertainty: Uncertainty
      readonly provenance: ComparisonSource
    }
  | {
      readonly statement: 'zu-knapp'
      readonly single: number
      readonly joint: number
      readonly delta: number
      readonly uncertainty: Uncertainty
      readonly provenance: ComparisonSource
    }
  | {
      readonly statement: 'unbestimmt'
      readonly single: number
      readonly joint: number
      readonly delta: number
      readonly uncertainty: Uncertainty
      readonly provenance: ComparisonSource
    }

export interface FilingTypeComparisonInput {
  readonly zveA: number
  readonly zveB: number
  readonly year: number
  readonly progressionClause: ProgressionClauseInput
  readonly churchTaxFactor?: ChurchTaxFactor
}

const MAX_MARGINAL_TAX_RATE = 0.45

export function progressionClauseLimit(pv: ProgressionClauseInput): Uncertainty {
  switch (pv.art) {
    case 'keine':
      return { kind: 'bestimmt', upperLimit: 0 }
    case 'lohnersatzleistungen': {
      if (!Number.isFinite(pv.amount) || pv.amount < 0) {
        throw new RangeError('lohnersatzleistungen betrag must be a non-negative finite number')
      }
      return { kind: 'bestimmt', upperLimit: Math.ceil(MAX_MARGINAL_TAX_RATE * pv.amount) }
    }
    case 'nicht-angegeben':
      return { kind: 'unbestimmt', reason: 'progressionsvorbehalt-nicht-eingegeben' }
  }
}

function validate(input: FilingTypeComparisonInput): void {
  if (!Number.isFinite(input.zveA) || !Number.isFinite(input.zveB)) {
    throw new RangeError('zvE must be a finite number')
  }
  if (input.zveA < 0 || input.zveB < 0) {
    throw new RangeError('zvE must not be negative')
  }
}

export function filingTypeComparison(input: FilingTypeComparisonInput): FilingTypeComparison {
  validate(input)
  const { zveA, zveB, progressionClause } = input
  if (!isSupportedIncomeTaxYear(input.year)) {
    throw new RangeError(`Unsupported tax year for §32a EStG: ${input.year}`)
  }
  const year: IncomeTaxYear = input.year
  const factor = input.churchTaxFactor ?? 0

  const exemptionLimits = soliExemptionLimits(year)
  const incomeTaxA = incomeTax(zveA, year)
  const incomeTaxB = incomeTax(zveB, year)
  const incomeTaxSeparate = incomeTaxA + incomeTaxB
  const incomeTaxJoint = splittingTariff(zveA, zveB, year)

  const soliSeparate = solidaritaetszuschlag(incomeTaxA, exemptionLimits.single) + solidaritaetszuschlag(incomeTaxB, exemptionLimits.single)
  const soliJoint = solidaritaetszuschlag(incomeTaxJoint, exemptionLimits.joint)

  const churchTaxSeparate = kirchensteuer(incomeTaxA, factor) + kirchensteuer(incomeTaxB, factor)
  const churchTaxJoint = kirchensteuer(incomeTaxJoint, factor)

  const single = incomeTaxSeparate + soliSeparate + churchTaxSeparate
  const joint = incomeTaxJoint + soliJoint + churchTaxJoint
  const delta = joint - single

  const components: TariffComponent[] = factor === 0 ? ['einkommensteuer', 'solidaritaetszuschlag'] : ['einkommensteuer', 'solidaritaetszuschlag', 'kirchensteuer']
  const provenance: ComparisonSource = { zveA: Math.floor(zveA), zveB: Math.floor(zveB), components }

  const uncertainty = progressionClauseLimit(progressionClause)

  if (uncertainty.kind === 'unbestimmt') {
    return { statement: 'unbestimmt', single, joint, delta, uncertainty, provenance }
  }
  if (Math.abs(delta) > uncertainty.upperLimit) {
    return { statement: 'eindeutig', recommendation: delta < 0 ? 'zusammen' : 'einzel', single, joint, delta, uncertainty, provenance }
  }
  return { statement: 'zu-knapp', single, joint, delta, uncertainty, provenance }
}
