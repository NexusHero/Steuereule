/**
 * Repairs in the first years after buying a rented building (§ 6 Abs. 1 Nr. 1a EStG): when the net
 * costs of repair and modernisation within three years of the purchase exceed 15 % of the
 * building's acquisition cost, they are no longer deductible at once but go into depreciation.
 * Yearly routine upkeep does not count towards the limit; the owl asks about that.
 */

export const ACQUISITION_RELATED_SHARE = 0.15
export const ACQUISITION_RELATED_YEARS = 3

export interface RentalRepair {
  /** When the work was done (ISO), not when it was paid. */
  readonly doneOn: string
  /** Without VAT. */
  readonly netEur: number
}

export interface RentalRepairsInput {
  readonly acquiredOn: string
  /** Acquisition cost of the building alone, without the land. */
  readonly buildingCostEur: number
  readonly repairs: readonly RentalRepair[]
}

export interface RentalRepairsResult {
  /** The last day of the three-year window (§ 108 AO, §§ 187 Abs. 1, 188 Abs. 2 BGB: bought on 01.04.2024, through 01.04.2027). */
  readonly windowEnd: string
  readonly limitEur: number
  readonly withinWindowEur: number
  readonly exceeds: boolean
  /** What can still be spent in the window without crossing the limit; 0 once crossed. */
  readonly roomLeftEur: number
}

const ISO = /^\d{4}-\d{2}-\d{2}$/

export function checkRentalRepairs(input: RentalRepairsInput): RentalRepairsResult {
  if (!ISO.test(input.acquiredOn) || input.repairs.some((repair) => !ISO.test(repair.doneOn))) throw new RangeError('dates must be ISO yyyy-mm-dd')
  if (!(input.buildingCostEur > 0) || input.repairs.some((repair) => !(repair.netEur >= 0))) throw new RangeError('amounts must be positive')
  const [y, m, d] = [Number(input.acquiredOn.slice(0, 4)), Number(input.acquiredOn.slice(5, 7)), Number(input.acquiredOn.slice(8, 10))]
  const lastDay = new Date(Date.UTC(y + ACQUISITION_RELATED_YEARS, m, 0)).getUTCDate()
  const end = new Date(Date.UTC(y + ACQUISITION_RELATED_YEARS, m - 1, Math.min(d, lastDay)))
  const windowEnd = end.toISOString().slice(0, 10)
  const limitEur = Math.floor(input.buildingCostEur * ACQUISITION_RELATED_SHARE)
  const withinWindowEur = Math.round(input.repairs.filter((repair) => repair.doneOn >= input.acquiredOn && repair.doneOn <= windowEnd).reduce((sum, repair) => sum + repair.netEur, 0))
  const exceeds = withinWindowEur > limitEur
  return { windowEnd, limitEur, withinWindowEur, exceeds, roomLeftEur: exceeds ? 0 : limitEur - withinWindowEur }
}
