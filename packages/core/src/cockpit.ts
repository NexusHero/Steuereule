// REQ-001 — Cockpit refund estimate as a RANGE, never a point value until everything is
// settled (product ADR-015). The range narrows as open items and conflicts are cleared;
// only with zero open items AND zero open conflicts does it collapse to a point value.
// Pure, deterministic, dependency-free (ultimate-dev-process §3.3/§3.4). Identifiers and
// messages are English (dev-process language); this module has no customer-facing text.

/** Uncertainty added to the range per still-open interview/receipt item, in euro. */
export const UNCERTAINTY_PER_ITEM = 60

/** Uncertainty added per open posten conflict (ADR-008 "± offen"), in euro. */
export const UNCERTAINTY_PER_CONFLICT = 100

export interface EstimateRange {
  readonly from: number
  readonly to: number
}

export interface CockpitInput {
  /** Base estimate before the range is spread, in euro (>= 0). */
  readonly estimate: number
  /** Number of still-open items (>= 0 integer). */
  readonly openItems: number
  /** Number of open posten conflicts (ADR-008). Defaults to 0. */
  readonly openConflicts?: number
  /** Override for the per-item uncertainty (testing / rule tuning). */
  readonly uncertaintyPerItem?: number
  /** Override for the per-conflict uncertainty. */
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

/** Compute the Cockpit estimate range from open items and conflicts (ADR-015). */
export function cockpitRange(input: CockpitInput): EstimateRange {
  validateInput(input)
  const conflicts = input.openConflicts ?? 0
  const perItem = input.uncertaintyPerItem ?? UNCERTAINTY_PER_ITEM
  const perConflict = input.uncertaintyPerConflict ?? UNCERTAINTY_PER_CONFLICT

  // Point value only when nothing is open (ADR-015).
  if (input.openItems === 0 && conflicts === 0) {
    return { from: input.estimate, to: input.estimate }
  }

  const uncertainty = input.openItems * perItem + conflicts * perConflict
  return {
    from: Math.max(0, input.estimate - uncertainty),
    to: input.estimate + uncertainty,
  }
}

/** True once the range has collapsed to a single value (nothing open). */
export function isPointValue(range: EstimateRange): boolean {
  return range.from === range.to
}
