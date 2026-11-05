import type { IncomeType } from './einkunftsarten.js'

export type Assessment =
  | { readonly kind: 'single' }
  | { readonly kind: 'joint'; readonly partnerTaxYearId: string }

export type Veranlagung =
  | { readonly kind: 'einzeln' }
  | { readonly kind: 'zusammen'; readonly partnerSteuerjahrId: string }

export interface TaxYear {
  readonly id: string
  readonly userId: string
  readonly year: number
  readonly incomeTypes: readonly (IncomeType | IncomeType)[]
  readonly assessment: Assessment
}

export interface Steuerjahr {
  readonly id: string
  readonly userId: string
  readonly jahr: number
  readonly einkunftsarten: readonly IncomeType[]
  readonly veranlagung: Veranlagung
}

export function couple<T extends TaxYear | Steuerjahr>(a: T, b: T): readonly [T, T] {
  if (a.userId === b.userId) {
    throw new Error('couple/kopple: a TaxYear cannot be coupled with itself (same userId)')
  }
  const yearA = 'year' in a ? a.year : a.jahr
  const yearB = 'year' in b ? b.year : b.jahr
  if (yearA !== yearB) {
    throw new Error('couple/kopple: Zusammenveranlagung links two Steuerjahre of the SAME calendar year')
  }

  const isCoupledA = 'assessment' in a ? a.assessment.kind !== 'single' : a.veranlagung.kind !== 'einzeln'
  const isCoupledB = 'assessment' in b ? b.assessment.kind !== 'single' : b.veranlagung.kind !== 'einzeln'
  if (isCoupledA || isCoupledB) {
    throw new Error('couple/kopple: both Steuerjahre must be einzeln before coupling')
  }

  if ('assessment' in a) {
    return [
      { ...a, assessment: { kind: 'joint', partnerTaxYearId: b.id } },
      { ...b, assessment: { kind: 'joint', partnerTaxYearId: a.id } },
    ]
  }

  return [
    { ...a, veranlagung: { kind: 'zusammen', partnerSteuerjahrId: b.id } },
    { ...b, veranlagung: { kind: 'zusammen', partnerSteuerjahrId: a.id } },
  ]
}

export function decouple<T extends TaxYear | Steuerjahr>(s: T): T {
  const isCoupled = 'assessment' in s ? s.assessment.kind === 'joint' : s.veranlagung.kind === 'zusammen'
  if (!isCoupled) {
    throw new Error('decouple/entkopple: a Steuerjahr that is not coupled cannot be decoupled')
  }

  if ('assessment' in s) {
    return { ...s, assessment: { kind: 'single' } }
  }

  return { ...s, veranlagung: { kind: 'einzeln' } }
}

// Backward-compatibility aliases
