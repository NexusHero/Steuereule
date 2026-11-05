import type { IncomeType } from './einkunftsarten.js'

export type Veranlagung =
  | { readonly kind: 'einzeln' }
  | { readonly kind: 'zusammen'; readonly partnerSteuerjahrId: string }

export interface Steuerjahr {
  readonly id: string
  readonly userId: string
  readonly jahr: number
  readonly einkunftsarten: readonly IncomeType[]
  readonly veranlagung: Veranlagung
}

export function couple<T extends Steuerjahr>(a: T, b: T): readonly [T, T] {
  if (a.userId === b.userId) {
    throw new Error('couple: a Steuerjahr cannot be coupled with itself (same userId)')
  }
  if (a.jahr !== b.jahr) {
    throw new Error('couple: Zusammenveranlagung links two Steuerjahre of the SAME calendar year')
  }
  if (a.veranlagung.kind !== 'einzeln' || b.veranlagung.kind !== 'einzeln') {
    throw new Error('couple: both Steuerjahre must be einzeln before coupling')
  }
  return [
    { ...a, veranlagung: { kind: 'zusammen', partnerSteuerjahrId: b.id } },
    { ...b, veranlagung: { kind: 'zusammen', partnerSteuerjahrId: a.id } },
  ]
}

export function decouple<T extends Steuerjahr>(s: T): T {
  if (s.veranlagung.kind !== 'zusammen') {
    throw new Error('decouple: a Steuerjahr that is not coupled cannot be decoupled')
  }
  return { ...s, veranlagung: { kind: 'einzeln' } }
}
