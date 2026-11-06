import type { IncomeType } from './einkunftsarten.js'

export type AssessmentType =
  | { readonly kind: 'einzeln' }
  | { readonly kind: 'zusammen'; readonly partnerTaxYearId: string }

export interface TaxYear {
  readonly id: string
  readonly userId: string
  readonly year: number
  readonly incomeTypes: readonly IncomeType[]
  readonly assessmentType: AssessmentType
}

export function couple<T extends TaxYear>(a: T, b: T): readonly [T, T] {
  if (a.userId === b.userId) {
    throw new Error('couple: a Steuerjahr cannot be coupled with itself (same userId)')
  }
  if (a.year !== b.year) {
    throw new Error('couple: Zusammenveranlagung links two Steuerjahre of the SAME calendar year')
  }
  if (a.assessmentType.kind !== 'einzeln' || b.assessmentType.kind !== 'einzeln') {
    throw new Error('couple: both Steuerjahre must be einzeln before coupling')
  }
  return [
    { ...a, assessmentType: { kind: 'zusammen', partnerTaxYearId: b.id } },
    { ...b, assessmentType: { kind: 'zusammen', partnerTaxYearId: a.id } },
  ]
}

export function decouple<T extends TaxYear>(s: T): T {
  if (s.assessmentType.kind !== 'zusammen') {
    throw new Error('decouple: a Steuerjahr that is not coupled cannot be decoupled')
  }
  return { ...s, assessmentType: { kind: 'einzeln' } }
}
