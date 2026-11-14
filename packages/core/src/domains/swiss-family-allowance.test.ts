import { describe, expect, it } from 'vitest'
import { swissAllowancePerChild } from './swiss-family-allowance'

// Both parents Grenzgänger (ADR-0088): the Swiss Kinderzulage comes with one parent's wage. Per child, its own
// amount wins; else the paying parent's yearly allowances (Anlage N-Gre Z. 8, in EUR) are shared among the
// children that parent is paying for.
describe('swissAllowancePerChild', () => {
  it('shares B’s allowances among all children when only B’s employer pays and no child names a payer', () => {
    expect(swissAllowancePerChild([{ payer: null, ownEur: null }, { payer: null, ownEur: null }], { A: 0, B: 2_748 })).toEqual([1_374, 1_374])
  })
  it('keeps each parent’s allowances to the children they are paid for', () => {
    const kids = [{ payer: 'A' as const, ownEur: null }, { payer: 'B' as const, ownEur: null }, { payer: 'B' as const, ownEur: null }]
    expect(swissAllowancePerChild(kids, { A: 2_400, B: 4_600 })).toEqual([2_400, 2_300, 2_300])
  })
  it('takes an amount entered for the child over any share, and leaves a child without allowance at null', () => {
    expect(swissAllowancePerChild([{ payer: 'A', ownEur: 900 }, { payer: 'A', ownEur: null }], { A: 2_000, B: null })).toEqual([900, 2_000])
    expect(swissAllowancePerChild([{ payer: null, ownEur: null }], { A: null, B: null })).toEqual([null])
  })
  it('gives unassigned children only the allowances no child is assigned to', () => {
    const kids = [{ payer: 'A' as const, ownEur: null }, { payer: null, ownEur: null }]
    expect(swissAllowancePerChild(kids, { A: 1_000, B: 3_000 })).toEqual([1_000, 3_000])
  })
})

describe('swissAllowancePerChild — edges', () => {
  it('treats a zero or missing own amount as open, and a payer without allowances as none', () => {
    expect(swissAllowancePerChild([{ payer: 'B', ownEur: 0 }, { payer: null, ownEur: null }], { A: 1_200, B: 0 })).toEqual([null, 1_200])
    expect(swissAllowancePerChild([], { A: 1_000, B: 1_000 })).toEqual([])
  })
})
