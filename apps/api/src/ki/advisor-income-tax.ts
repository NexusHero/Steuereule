import { incomeTax, isSupportedIncomeTaxYear, kirchensteuer, soliExemptionLimits, solidaritaetszuschlag, splittingTariff, type ChurchTaxFactor } from '@steuereule/core'

export interface IncomeTaxInput {
  readonly year: number
  readonly taxableIncome: number
  readonly splitting: boolean
  readonly churchTaxRate: ChurchTaxFactor
  readonly extraDeduction: number
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
}

function figures(year: number, taxableIncome: number, splitting: boolean, churchTaxRate: ChurchTaxFactor): IncomeTaxFigures {
  const zvE = Math.floor(taxableIncome)
  const incomeTaxEur = splitting ? splittingTariff(zvE, 0, year) : incomeTax(zvE, year)
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
  const base = figures(input.year, input.taxableIncome, input.splitting, input.churchTaxRate)
  const next = figures(input.year, input.taxableIncome + 100, input.splitting, input.churchTaxRate)
  const withDeduction = input.extraDeduction > 0 ? figures(input.year, Math.max(0, input.taxableIncome - input.extraDeduction), input.splitting, input.churchTaxRate) : undefined
  return {
    year: input.year,
    assessment: input.splitting ? 'joint' : 'single',
    ...base,
    marginalRatePercent: next.totalEur - base.totalEur,
    ...(withDeduction ? { withDeduction, savingEur: base.totalEur - withDeduction.totalEur } : {}),
  }
}
