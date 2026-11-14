import type { TaxEstimateDto } from '@steuereule/api-client'

/** The middle of the estimated refund (negative: a back payment); null when there is no estimate. */
export function estimateMidpoint(estimate: TaxEstimateDto | null | undefined): number | null {
  if (estimate?.kind !== 'spanne' || estimate.result == null) return null
  return Math.round((estimate.result.from + estimate.result.to) / 2)
}

/**
 * What each Strom page changed in the estimate, kept for this session (UX review H1, Wirkungszeile):
 * the summary lists it per topic. Only a measured change is kept — never a guess.
 */
const effects = new Map<string, number>()

export function rememberEffect(year: number, slug: string, before: number | null, after: number | null): void {
  if (before === null || after === null) return
  effects.set(`${year}:${slug}`, after - before)
}

export function effectOf(year: number, slug: string): number | null {
  return effects.get(`${year}:${slug}`) ?? null
}

/** For tests. */
export function forgetEffects(): void {
  effects.clear()
}
