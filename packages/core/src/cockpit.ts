export const UNCERTAINTY_PER_ITEM = 60

export const UNCERTAINTY_PER_CONFLICT = 100

export interface EstimateRange {
  readonly from: number
  readonly to: number
}

export interface CockpitInput {
  readonly estimate: number
  readonly openItems: number
  readonly openConflicts?: number
  readonly uncertaintyPerItem?: number
  readonly uncertaintyPerConflict?: number
}

function validateInput(input: CockpitInput): void {
  if (!Number.isFinite(input.estimate) || input.estimate < 0) {
    throw new RangeError('estimate must be a non-negative finite number')
  }
  if (!Number.isInteger(input.openItems) || input.openItems < 0) {
    throw new RangeError('openItems must be a non-negative integer')
  }
  const conflicts = input.openConflicts ?? 0
  if (!Number.isInteger(conflicts) || conflicts < 0) {
    throw new RangeError('openConflicts must be a non-negative integer')
  }
}

export function cockpitRange(input: CockpitInput): EstimateRange {
  validateInput(input)
  const conflicts = input.openConflicts ?? 0
  const perItem = input.uncertaintyPerItem ?? UNCERTAINTY_PER_ITEM
  const perConflict = input.uncertaintyPerConflict ?? UNCERTAINTY_PER_CONFLICT

  if (input.openItems === 0 && conflicts === 0) {
    return { from: input.estimate, to: input.estimate }
  }

  const uncertainty = input.openItems * perItem + conflicts * perConflict
  return {
    from: Math.max(0, input.estimate - uncertainty),
    to: input.estimate + uncertainty,
  }
}

export function isPointValue(range: EstimateRange): boolean {
  return range.from === range.to
}
