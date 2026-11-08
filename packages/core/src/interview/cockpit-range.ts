import { calculate, type CalculationInput, type CalculationStatus } from '../engine/berechnung'
import type { IncomeType } from '../domains/income-types'
import { UNCERTAINTY_PER_CONFLICT, UNCERTAINTY_PER_ITEM } from './cockpit'

export type CockpitRange =
  | { readonly kind: 'bestimmt'; readonly value: number }
  | {
      readonly kind: 'spanne'
      readonly from: number
      readonly to: number
      readonly openItems: number
      readonly conflicts: number
      readonly unconfirmedItems: number
      readonly unconfirmedSum: number
    }
  | { readonly kind: 'gated'; readonly sum: number; readonly gated: readonly IncomeType[] }

/** The count-based inputs a caller holds before any Posten objects exist. */
export interface CockpitRangeInputs {
  readonly sum: number
  readonly openItems: number
  readonly conflicts: number
  readonly gated: readonly IncomeType[]
  readonly unconfirmedItems?: number
  readonly unconfirmedSum?: number
}

function rangeFromNumbers(
  sum: number,
  openItems: number,
  conflicts: number,
  gated: readonly IncomeType[],
  unconfirmedItems = 0,
  unconfirmedSum = 0,
): CockpitRange {
  if (gated.length > 0) return { kind: 'gated', sum, gated }
  if (openItems === 0 && conflicts === 0 && unconfirmedItems === 0) return { kind: 'bestimmt', value: sum }

  const uncertainty = openItems * UNCERTAINTY_PER_ITEM + conflicts * UNCERTAINTY_PER_CONFLICT + unconfirmedSum
  return {
    kind: 'spanne',
    from: Math.max(0, sum - uncertainty),
    to: sum + uncertainty,
    openItems,
    conflicts,
    unconfirmedItems,
    unconfirmedSum,
  }
}

export function calculateCockpitRange(status: CalculationStatus): CockpitRange {
  if (status.kind === 'bestimmt') return { kind: 'bestimmt', value: status.einnahmen }
  return rangeFromNumbers(
    status.einnahmen,
    status.openItems,
    status.conflicts,
    status.gated,
    status.unconfirmedItems,
    status.unconfirmedSum,
  )
}

export function cockpitRangeFromInputs(inputs: CockpitRangeInputs): CockpitRange {
  return rangeFromNumbers(
    inputs.sum,
    inputs.openItems,
    inputs.conflicts,
    inputs.gated,
    inputs.unconfirmedItems ?? 0,
    inputs.unconfirmedSum ?? 0,
  )
}

export function rangeFromCalculation(input: CalculationInput): CockpitRange {
  return calculateCockpitRange(calculate(input))
}
