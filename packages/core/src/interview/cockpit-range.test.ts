import { describe, expect, it } from 'vitest'
import { calculate } from '../engine/berechnung'
import { UNCERTAINTY_PER_CONFLICT, UNCERTAINTY_PER_ITEM } from './cockpit'
import { calculateCockpitRange, cockpitRangeFromInputs, rangeFromCalculation } from './cockpit-range'

describe('cockpitSpanne', () => {
  it('bestimmt collapses to a point value (ADR-015)', () => {
    const status = calculate({ items: [{ id: 'p1', incomeType: 'Nichtselbstständig', amount: 1407, source: { kind: 'eingabe' } }], openItems: 0, conflicts: [], gated: [] })
    expect(status.kind).toBe('bestimmt')
    expect(calculateCockpitRange(status)).toStrictEqual({ kind: 'bestimmt', value: 1407 })
  })

  it('open items widen the settled sum into a bounded range', () => {
    const status = calculate({ items: [{ id: 'p1', incomeType: 'Nichtselbstständig', amount: 1407, source: { kind: 'eingabe' } }], openItems: 3, conflicts: [], gated: [] })
    expect(status.kind).toBe('offen')
    const spread = 3 * UNCERTAINTY_PER_ITEM
    expect(calculateCockpitRange(status)).toStrictEqual({ kind: 'spanne', from: 1407 - spread, to: 1407 + spread, openItems: 3, conflicts: 0, unconfirmedItems: 0, unconfirmedSum: 0 })
  })

  it('a conflict widens more than an item (ADR-008 ± offen)', () => {
    const status = calculate({ items: [{ id: 'p1', incomeType: 'Nichtselbstständig', amount: 1000, source: { kind: 'eingabe' } }], openItems: 0, conflicts: [{ itemId: 'c1', incomeType: 'Nichtselbstständig', sources: [{ kind: 'eingabe', amount: 100 }, { kind: 'beleg', receiptId: 'b1', amount: 200 }] }], gated: [] })
    expect(calculateCockpitRange(status)).toStrictEqual({ kind: 'spanne', from: 1000 - UNCERTAINTY_PER_CONFLICT, to: 1000 + UNCERTAINTY_PER_CONFLICT, openItems: 0, conflicts: 1, unconfirmedItems: 0, unconfirmedSum: 0 })
  })

  it('items and conflicts add up', () => {
    const status = calculate({ items: [{ id: 'p1', incomeType: 'Nichtselbstständig', amount: 1000, source: { kind: 'eingabe' } }], openItems: 2, conflicts: [{ itemId: 'c1', incomeType: 'Nichtselbstständig', sources: [{ kind: 'eingabe', amount: 1 }, { kind: 'beleg', receiptId: 'b1', amount: 2 }] }], gated: [] })
    const spread = 2 * UNCERTAINTY_PER_ITEM + 1 * UNCERTAINTY_PER_CONFLICT
    expect(calculateCockpitRange(status)).toStrictEqual({ kind: 'spanne', from: 1000 - spread, to: 1000 + spread, openItems: 2, conflicts: 1, unconfirmedItems: 0, unconfirmedSum: 0 })
  })

  it('a gated Einkunftsart is named, never widened into a fake range (ADR-032)', () => {
    const status = calculate({ items: [{ id: 'p1', incomeType: 'Nichtselbstständig', amount: 500, source: { kind: 'eingabe' } }], openItems: 0, conflicts: [], gated: ['Gewerbe'] })
    expect(calculateCockpitRange(status)).toStrictEqual({ kind: 'gated', sum: 500, gated: ['Gewerbe'] })
  })

  it('lower bound never below zero', () => {
    const status = calculate({ items: [{ id: 'p1', incomeType: 'Nichtselbstständig', amount: 50, source: { kind: 'eingabe' } }], openItems: 3, conflicts: [], gated: [] })
    const result = calculateCockpitRange(status)
    expect(result.kind).toBe('spanne')
    if (result.kind !== 'spanne') return
    expect(result.from).toBe(0)
    expect(result.to).toBe(50 + 3 * UNCERTAINTY_PER_ITEM)
  })
})

describe('spanneAusBerechnung', () => {
  it('folds a full BerechnungsInput through berechne and derives the spanne', () => {
    const input = {
      items: [{ id: 'p1', incomeType: 'Nichtselbstständig' as const, amount: 1407, source: { kind: 'eingabe' as const } }],
      openItems: 3,
      conflicts: [],
      gated: [],
    }
    const spread = 3 * UNCERTAINTY_PER_ITEM
    expect(rangeFromCalculation(input)).toStrictEqual({ kind: 'spanne', from: 1407 - spread, to: 1407 + spread, openItems: 3, conflicts: 0, unconfirmedItems: 0, unconfirmedSum: 0 })
  })
})

describe('cockpitSpanneAusEingaben', () => {
  it('derives a point value when nothing is open or gated', () => {
    expect(cockpitRangeFromInputs({ sum: 1444, openItems: 0, conflicts: 0, gated: [] })).toStrictEqual({ kind: 'bestimmt', value: 1444 })
  })

  it('derives a range from the counts without fabricating PostenKonflikt objects', () => {
    const spread = 2 * UNCERTAINTY_PER_ITEM + 1 * UNCERTAINTY_PER_CONFLICT
    expect(cockpitRangeFromInputs({ sum: 1000, openItems: 2, conflicts: 1, gated: [] })).toStrictEqual({
      kind: 'spanne',
      from: 1000 - spread,
      to: 1000 + spread,
      openItems: 2,
      conflicts: 1,
      unconfirmedItems: 0,
      unconfirmedSum: 0,
    })
  })

  it('names a gated Einkunftsart rather than widening into a fake range', () => {
    expect(cockpitRangeFromInputs({ sum: 500, openItems: 0, conflicts: 0, gated: ['Gewerbe'] })).toStrictEqual({ kind: 'gated', sum: 500, gated: ['Gewerbe'] })
  })
})
