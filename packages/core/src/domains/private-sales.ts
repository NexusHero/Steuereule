/**
 * Private sales (§ 23 EStG): when a gain is taxable at all, and whether the year's gains stay under
 * the exemption limit. Dates are ISO (yyyy-mm-dd); periods run by § 108 AO with §§ 187, 188 BGB:
 * one bought on 15.03.2024 is held "more than a year" from 16.03.2025 on.
 */

export const PRIVATE_SALE_KINDS = ['crypto', 'gold', 'other', 'property'] as const
export type PrivateSaleKind = (typeof PRIVATE_SALE_KINDS)[number]

/** § 23 Abs. 1 Satz 1 Nr. 1, 2 EStG: ten years for land and buildings, one year for other assets. */
export function holdingYears(kind: PrivateSaleKind): number {
  return kind === 'property' ? 10 : 1
}

/** § 23 Abs. 3 Satz 5 EStG: an exemption limit, not an allowance; 600 € up to 2023, 1.000 € from 2024. */
export function privateSalesExemptionLimit(year: number): number {
  return year >= 2024 ? 1000 : 600
}

function addYears(iso: string, years: number): Date {
  const [y, m, d] = [Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), Number(iso.slice(8, 10))]
  // 29.02. plus whole years ends on 28.02. (§ 188 Abs. 3 BGB).
  const lastDay = new Date(Date.UTC(y + years, m, 0)).getUTCDate()
  return new Date(Date.UTC(y + years, m - 1, Math.min(d, lastDay)))
}

const ISO = /^\d{4}-\d{2}-\d{2}$/

export interface PrivateSaleInput {
  readonly kind: PrivateSaleKind
  readonly acquiredOn: string
  readonly soldOn: string
  /** Property only: used solely for own housing from purchase to sale (§ 23 Abs. 1 Nr. 1 Satz 3 Alt. 1). */
  readonly ownUseThroughout?: boolean | undefined
  /** Property only: used for own housing in the year of sale and the two calendar years before (Alt. 2). */
  readonly ownUseYearOfSaleAndTwoBefore?: boolean | undefined
}

export interface PrivateSaleResult {
  /** The first day a sale is outside the period. */
  readonly taxFreeFrom: string
  readonly withinPeriod: boolean
  readonly ownUseExempt: boolean
  /** Whether the gain (or loss) counts under § 23 at all. */
  readonly taxable: boolean
}

export function checkPrivateSale(input: PrivateSaleInput): PrivateSaleResult {
  if (!ISO.test(input.acquiredOn) || !ISO.test(input.soldOn)) throw new RangeError('acquiredOn and soldOn must be ISO yyyy-mm-dd dates')
  if (input.soldOn < input.acquiredOn) throw new RangeError('soldOn must not be before acquiredOn')
  const periodEnd = addYears(input.acquiredOn, holdingYears(input.kind))
  const taxFree = new Date(periodEnd)
  taxFree.setUTCDate(taxFree.getUTCDate() + 1)
  const taxFreeFrom = taxFree.toISOString().slice(0, 10)
  const withinPeriod = input.soldOn < taxFreeFrom
  const ownUseExempt = input.kind === 'property' && (input.ownUseThroughout === true || input.ownUseYearOfSaleAndTwoBefore === true)
  return { taxFreeFrom, withinPeriod, ownUseExempt, taxable: withinPeriod && !ownUseExempt }
}

/** Whether the year's total gain from private sales stays tax free: below the limit, all of it; at or above, all of it is taxed. */
export function privateSalesWithinLimit(totalGainEur: number, year: number): boolean {
  return totalGainEur < privateSalesExemptionLimit(year)
}
