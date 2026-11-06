import { describe, expect, it } from 'vitest'
import { decouple, couple, type TaxYear, type AssessmentType } from './steuerjahr'

// ADR-006 — ownership + coupling. The core invariants under test: (1) a Steuerjahr belongs
// to one person, (2) a coupling links two persons' years of the SAME calendar year,
// (3) decoupling dissolves only the link, never the data.

function year(id: string, userId: string, calendarYear: number, assessmentType: AssessmentType = { kind: 'einzeln' }): TaxYear {
  return { id, userId, year: calendarYear, incomeTypes: ['Nichtselbstständig'], assessmentType }
}

describe('kopple — Zusammenveranlagung links two persons’ years of the same calendar year (ADR-006)', () => {
  it('links two single-veranlagung years of the same year, different persons, symmetrically', () => {
    const a = year('a', 'person-1', 2026)
    const b = year('b', 'person-2', 2026)

    const [a2, b2] = couple(a, b)

    expect(a2.assessmentType).toEqual({ kind: 'zusammen', partnerTaxYearId: 'b' })
    expect(b2.assessmentType).toEqual({ kind: 'zusammen', partnerTaxYearId: 'a' })
    // Data preserved: only the coupling changed.
    expect(a2).toEqual({ ...a, assessmentType: { kind: 'zusammen', partnerTaxYearId: 'b' } })
    expect(a2.incomeTypes).toEqual(a.incomeTypes)
    expect(a2.userId).toBe('person-1')
  })

  it('refuses to couple a year with itself (same userId)', () => {
    const a = year('a', 'person-1', 2026)
    const b = year('b', 'person-1', 2026)
    expect(() => couple(a, b)).toThrow(/same userId/)
  })

  it('refuses to couple two different calendar years', () => {
    const a = year('a', 'person-1', 2026)
    const b = year('b', 'person-2', 2025)
    expect(() => couple(a, b)).toThrow(/SAME calendar year/)
  })

  it('refuses to couple when either side is already coupled', () => {
    const a = year('a', 'person-1', 2026)
    const b = year('b', 'person-2', 2026)
    const [a2] = couple(a, b)
    const c = year('c', 'person-3', 2026)
    expect(() => couple(a2, c)).toThrow(/must be einzeln/)
  })
})

describe('entkopple — dissolves only the link, never the data (ADR-006)', () => {
  it('returns a coupled year to einzeln, keeping id/userId/jahr/einkunftsarten', () => {
    const a = year('a', 'person-1', 2026)
    const b = year('b', 'person-2', 2026)
    const [a2] = couple(a, b)

    const decoupled = decouple(a2)

    expect(decoupled).toEqual({ ...a, assessmentType: { kind: 'einzeln' } })
    expect(decoupled.incomeTypes).toEqual(['Nichtselbstständig'])
  })

  it('refuses to decouple a year that is not coupled', () => {
    expect(() => decouple(year('a', 'person-1', 2026))).toThrow(/not coupled/)
  })
})
