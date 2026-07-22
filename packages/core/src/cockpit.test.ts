import { describe, it, expect } from 'vitest'
import {
  spanneFuerCockpit,
  istPunktwert,
  UNSICHERHEIT_PRO_ANGABE,
  UNSICHERHEIT_PRO_KONFLIKT,
} from './cockpit'

describe('spanneFuerCockpit', () => {
  it('open_items_spread_range_symmetrically', () => {
    // 1407 base, 3 open items -> ±180 (ADR-015). Golden case from demo-daten.js.
    const s = spanneFuerCockpit({ schaetzung: 1407, offeneAngaben: 3 })
    expect(s).toStrictEqual({ von: 1227, bis: 1587 })
  })

  it('nothing_open_collapses_to_point_value', () => {
    const s = spanneFuerCockpit({ schaetzung: 1407, offeneAngaben: 0 })
    expect(s).toStrictEqual({ von: 1407, bis: 1407 })
    expect(istPunktwert(s)).toBe(true)
  })

  it('open_conflict_widens_more_than_an_item', () => {
    const s = spanneFuerCockpit({ schaetzung: 1407, offeneAngaben: 0, offeneKonflikte: 1 })
    expect(s).toStrictEqual({ von: 1307, bis: 1507 })
  })

  it('lower_bound_never_below_zero', () => {
    const s = spanneFuerCockpit({ schaetzung: 50, offeneAngaben: 3 })
    expect(s.von).toBe(0)
    expect(s.bis).toBe(50 + 3 * UNSICHERHEIT_PRO_ANGABE)
  })

  it('items_and_conflicts_add_up', () => {
    const s = spanneFuerCockpit({ schaetzung: 1000, offeneAngaben: 2, offeneKonflikte: 1 })
    const spread = 2 * UNSICHERHEIT_PRO_ANGABE + 1 * UNSICHERHEIT_PRO_KONFLIKT
    expect(s).toStrictEqual({ von: 1000 - spread, bis: 1000 + spread })
  })

  it('overrides_replace_default_uncertainty', () => {
    const s = spanneFuerCockpit({ schaetzung: 1000, offeneAngaben: 1, unsicherheitProAngabe: 10 })
    expect(s).toStrictEqual({ von: 990, bis: 1010 })
  })

  it('negative_open_items_throw_range_error', () => {
    expect(() => spanneFuerCockpit({ schaetzung: 1000, offeneAngaben: -1 })).toThrow(RangeError)
  })

  it('non_integer_open_items_throw_range_error', () => {
    expect(() => spanneFuerCockpit({ schaetzung: 1000, offeneAngaben: 1.5 })).toThrow(RangeError)
  })

  it('negative_estimate_throws_range_error', () => {
    expect(() => spanneFuerCockpit({ schaetzung: -1, offeneAngaben: 0 })).toThrow(RangeError)
  })

  it('nonfinite_estimate_throws_range_error', () => {
    expect(() => spanneFuerCockpit({ schaetzung: Number.NaN, offeneAngaben: 0 })).toThrow(RangeError)
  })

  it('negative_conflicts_throw_range_error', () => {
    expect(() =>
      spanneFuerCockpit({ schaetzung: 1000, offeneAngaben: 0, offeneKonflikte: -1 }),
    ).toThrow(RangeError)
  })

  it('non_integer_conflicts_throw_range_error', () => {
    expect(() =>
      spanneFuerCockpit({ schaetzung: 1000, offeneAngaben: 0, offeneKonflikte: 0.5 }),
    ).toThrow(RangeError)
  })
})

describe('istPunktwert', () => {
  it('true_when_bounds_equal', () => {
    expect(istPunktwert({ von: 1407, bis: 1407 })).toBe(true)
  })

  it('false_when_bounds_differ', () => {
    expect(istPunktwert({ von: 1227, bis: 1587 })).toBe(false)
  })
})
