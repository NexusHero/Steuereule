import type { Einkunftsart } from './einkunftsarten.js'

export type Veranlagung =
  | { readonly kind: 'einzeln' }
  | { readonly kind: 'zusammen'; readonly partnerSteuerjahrId: string }

export interface Steuerjahr {
  readonly id: string
  readonly userId: string
  readonly jahr: number
  readonly einkunftsarten: readonly Einkunftsart[]
  readonly veranlagung: Veranlagung
}

export function kopple(a: Steuerjahr, b: Steuerjahr): readonly [Steuerjahr, Steuerjahr] {
  if (a.userId === b.userId) {
    throw new Error('kopple: a Steuerjahr cannot be coupled with itself (same userId)')
  }
  if (a.jahr !== b.jahr) {
    throw new Error('kopple: Zusammenveranlagung links two Steuerjahre of the SAME calendar year')
  }
  if (a.veranlagung.kind !== 'einzeln' || b.veranlagung.kind !== 'einzeln') {
    throw new Error('kopple: both Steuerjahre must be einzeln before coupling')
  }
  return [
    { ...a, veranlagung: { kind: 'zusammen', partnerSteuerjahrId: b.id } },
    { ...b, veranlagung: { kind: 'zusammen', partnerSteuerjahrId: a.id } },
  ]
}

export function entkopple(s: Steuerjahr): Steuerjahr {
  if (s.veranlagung.kind !== 'zusammen') {
    throw new Error('entkopple: a Steuerjahr that is not coupled cannot be decoupled')
  }
  return { ...s, veranlagung: { kind: 'einzeln' } }
}
