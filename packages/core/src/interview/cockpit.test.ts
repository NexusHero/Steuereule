import { describe, it, expect } from 'vitest'
import {
  cockpitRange,
  isPointValue,
  UNCERTAINTY_PER_ITEM,
  UNCERTAINTY_PER_CONFLICT,
} from './cockpit'

describe('cockpitRange', () => {
  it('open_items_spread_range_symmetrically', () => {
    // 1407 base, 3 open items -> ±180 (ADR-015). Golden case from demo-daten.js.
    const r = cockpitRange({ estimate: 1407, openItems: 3 })
    expect(r).toStrictEqual({ from: 1227, to: 1587 })
  })

  it('nothing_open_collapses_to_point_value', () => {
    const r = cockpitRange({ estimate: 1407, openItems: 0 })
    expect(r).toStrictEqual({ from: 1407, to: 1407 })
    expect(isPointValue(r)).toBe(true)
  })

  it('open_conflict_widens_more_than_an_item', () => {
    const r = cockpitRange({ estimate: 1407, openItems: 0, openConflicts: 1 })
    expect(r).toStrictEqual({ from: 1307, to: 1507 })
  })

  it('lower_bound_never_below_zero', () => {
    const r = cockpitRange({ estimate: 50, openItems: 3 })
    expect(r.from).toBe(0)
    expect(r.to).toBe(50 + 3 * UNCERTAINTY_PER_ITEM)
  })

  it('items_and_conflicts_add_up', () => {
    const r = cockpitRange({ estimate: 1000, openItems: 2, openConflicts: 1 })
    const spread = 2 * UNCERTAINTY_PER_ITEM + 1 * UNCERTAINTY_PER_CONFLICT
    expect(r).toStrictEqual({ from: 1000 - spread, to: 1000 + spread })
  })

  it('overrides_replace_default_uncertainty', () => {
    const r = cockpitRange({ estimate: 1000, openItems: 1, uncertaintyPerItem: 10 })
    expect(r).toStrictEqual({ from: 990, to: 1010 })
  })

  it('negative_open_items_throw_range_error', () => {
    expect(() => cockpitRange({ estimate: 1000, openItems: -1 })).toThrow(RangeError)
  })

  it('non_integer_open_items_throw_range_error', () => {
    expect(() => cockpitRange({ estimate: 1000, openItems: 1.5 })).toThrow(RangeError)
  })

  it('negative_estimate_throws_range_error', () => {
    expect(() => cockpitRange({ estimate: -1, openItems: 0 })).toThrow(RangeError)
  })

  it('nonfinite_estimate_throws_range_error', () => {
    expect(() => cockpitRange({ estimate: Number.NaN, openItems: 0 })).toThrow(RangeError)
  })

  it('negative_conflicts_throw_range_error', () => {
    expect(() => cockpitRange({ estimate: 1000, openItems: 0, openConflicts: -1 })).toThrow(RangeError)
  })

  it('non_integer_conflicts_throw_range_error', () => {
    expect(() => cockpitRange({ estimate: 1000, openItems: 0, openConflicts: 0.5 })).toThrow(RangeError)
  })
})

describe('isPointValue', () => {
  it('true_when_bounds_equal', () => {
    expect(isPointValue({ from: 1407, to: 1407 })).toBe(true)
  })

  it('false_when_bounds_differ', () => {
    expect(isPointValue({ from: 1227, to: 1587 })).toBe(false)
  })
})
