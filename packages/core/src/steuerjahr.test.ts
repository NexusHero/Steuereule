import { describe, expect, it } from 'vitest'
import { entkopple, kopple, type Steuerjahr, type Veranlagung } from './steuerjahr'

// ADR-006 — ownership + coupling. The core invariants under test: (1) a Steuerjahr belongs
// to one person, (2) a coupling links two persons' years of the SAME calendar year,
// (3) decoupling dissolves only the link, never the data.

function jahr(id: string, userId: string, kalenderjahr: number, veranlagung: Veranlagung = { kind: 'einzeln' }): Steuerjahr {
  return { id, userId, jahr: kalenderjahr, einkunftsarten: ['Nichtselbstständig'], veranlagung }
}

describe('kopple — Zusammenveranlagung links two persons’ years of the same calendar year (ADR-006)', () => {
  it('links two single-veranlagung years of the same year, different persons, symmetrically', () => {
    const a = jahr('a', 'person-1', 2026)
    const b = jahr('b', 'person-2', 2026)

    const [a2, b2] = kopple(a, b)

    expect(a2.veranlagung).toEqual({ kind: 'zusammen', partnerSteuerjahrId: 'b' })
    expect(b2.veranlagung).toEqual({ kind: 'zusammen', partnerSteuerjahrId: 'a' })
    // Data preserved: only the coupling changed.
    expect(a2).toEqual({ ...a, veranlagung: { kind: 'zusammen', partnerSteuerjahrId: 'b' } })
    expect(a2.einkunftsarten).toEqual(a.einkunftsarten)
    expect(a2.userId).toBe('person-1')
  })

  it('refuses to couple a year with itself (same userId)', () => {
    const a = jahr('a', 'person-1', 2026)
    const b = jahr('b', 'person-1', 2026)
    expect(() => kopple(a, b)).toThrow(/same userId/)
  })

  it('refuses to couple two different calendar years', () => {
    const a = jahr('a', 'person-1', 2026)
    const b = jahr('b', 'person-2', 2025)
    expect(() => kopple(a, b)).toThrow(/SAME calendar year/)
  })

  it('refuses to couple when either side is already coupled', () => {
    const a = jahr('a', 'person-1', 2026)
    const b = jahr('b', 'person-2', 2026)
    const [a2] = kopple(a, b)
    const c = jahr('c', 'person-3', 2026)
    expect(() => kopple(a2, c)).toThrow(/must be einzeln/)
  })
})

describe('entkopple — dissolves only the link, never the data (ADR-006)', () => {
  it('returns a coupled year to einzeln, keeping id/userId/jahr/einkunftsarten', () => {
    const a = jahr('a', 'person-1', 2026)
    const b = jahr('b', 'person-2', 2026)
    const [a2] = kopple(a, b)

    const decoupled = entkopple(a2)

    expect(decoupled).toEqual({ ...a, veranlagung: { kind: 'einzeln' } })
    expect(decoupled.einkunftsarten).toEqual(['Nichtselbstständig'])
  })

  it('refuses to decouple a year that is not coupled', () => {
    expect(() => entkopple(jahr('a', 'person-1', 2026))).toThrow(/not coupled/)
  })
})
