import { describe, expect, it } from 'vitest'
import { berechne } from './berechnung.js'
import { UNCERTAINTY_PER_CONFLICT, UNCERTAINTY_PER_ITEM } from './cockpit.js'
import { cockpitSpanne, cockpitSpanneAusEingaben, spanneAusBerechnung } from './cockpit-spanne.js'

describe('cockpitSpanne', () => {
  it('bestimmt collapses to a point value (ADR-015)', () => {
    const stand = berechne({ posten: [{ id: 'p1', einkunftsart: 'Nichtselbstständig', betrag: 1407, quelle: { art: 'eingabe' } }], offenePosten: 0, konflikte: [], gegated: [] })
    expect(stand.kind).toBe('bestimmt')
    expect(cockpitSpanne(stand)).toStrictEqual({ kind: 'bestimmt', wert: 1407 })
  })

  it('open items widen the settled sum into a bounded range', () => {
    const stand = berechne({ posten: [{ id: 'p1', einkunftsart: 'Nichtselbstständig', betrag: 1407, quelle: { art: 'eingabe' } }], offenePosten: 3, konflikte: [], gegated: [] })
    expect(stand.kind).toBe('offen')
    const spread = 3 * UNCERTAINTY_PER_ITEM
    expect(cockpitSpanne(stand)).toStrictEqual({ kind: 'spanne', von: 1407 - spread, bis: 1407 + spread, offenePosten: 3, konflikte: 0 })
  })

  it('a conflict widens more than an item (ADR-008 ± offen)', () => {
    const stand = berechne({ posten: [{ id: 'p1', einkunftsart: 'Nichtselbstständig', betrag: 1000, quelle: { art: 'eingabe' } }], offenePosten: 0, konflikte: [{ postenId: 'c1', einkunftsart: 'Nichtselbstständig', quellen: [{ art: 'eingabe', betrag: 100 }, { art: 'beleg', belegId: 'b1', betrag: 200 }] }], gegated: [] })
    expect(cockpitSpanne(stand)).toStrictEqual({ kind: 'spanne', von: 1000 - UNCERTAINTY_PER_CONFLICT, bis: 1000 + UNCERTAINTY_PER_CONFLICT, offenePosten: 0, konflikte: 1 })
  })

  it('items and conflicts add up', () => {
    const stand = berechne({ posten: [{ id: 'p1', einkunftsart: 'Nichtselbstständig', betrag: 1000, quelle: { art: 'eingabe' } }], offenePosten: 2, konflikte: [{ postenId: 'c1', einkunftsart: 'Nichtselbstständig', quellen: [{ art: 'eingabe', betrag: 1 }, { art: 'beleg', belegId: 'b1', betrag: 2 }] }], gegated: [] })
    const spread = 2 * UNCERTAINTY_PER_ITEM + 1 * UNCERTAINTY_PER_CONFLICT
    expect(cockpitSpanne(stand)).toStrictEqual({ kind: 'spanne', von: 1000 - spread, bis: 1000 + spread, offenePosten: 2, konflikte: 1 })
  })

  it('a gated Einkunftsart is named, never widened into a fake range (ADR-032)', () => {
    const stand = berechne({ posten: [{ id: 'p1', einkunftsart: 'Nichtselbstständig', betrag: 500, quelle: { art: 'eingabe' } }], offenePosten: 0, konflikte: [], gegated: ['Gewerbe'] })
    expect(cockpitSpanne(stand)).toStrictEqual({ kind: 'gated', summe: 500, gegated: ['Gewerbe'] })
  })

  it('lower bound never below zero', () => {
    const stand = berechne({ posten: [{ id: 'p1', einkunftsart: 'Nichtselbstständig', betrag: 50, quelle: { art: 'eingabe' } }], offenePosten: 3, konflikte: [], gegated: [] })
    const result = cockpitSpanne(stand)
    expect(result.kind).toBe('spanne')
    if (result.kind !== 'spanne') return
    expect(result.von).toBe(0)
    expect(result.bis).toBe(50 + 3 * UNCERTAINTY_PER_ITEM)
  })
})

describe('spanneAusBerechnung', () => {
  it('folds a full BerechnungsInput through berechne and derives the spanne', () => {
    const input = {
      posten: [{ id: 'p1', einkunftsart: 'Nichtselbstständig' as const, betrag: 1407, quelle: { art: 'eingabe' as const } }],
      offenePosten: 3,
      konflikte: [],
      gegated: [],
    }
    const spread = 3 * UNCERTAINTY_PER_ITEM
    expect(spanneAusBerechnung(input)).toStrictEqual({ kind: 'spanne', von: 1407 - spread, bis: 1407 + spread, offenePosten: 3, konflikte: 0 })
  })
})

describe('cockpitSpanneAusEingaben', () => {
  it('derives a point value when nothing is open or gated', () => {
    expect(cockpitSpanneAusEingaben({ summe: 1444, offenePosten: 0, konflikte: 0, gegated: [] })).toStrictEqual({ kind: 'bestimmt', wert: 1444 })
  })

  it('derives a range from the counts without fabricating PostenKonflikt objects', () => {
    const spread = 2 * UNCERTAINTY_PER_ITEM + 1 * UNCERTAINTY_PER_CONFLICT
    expect(cockpitSpanneAusEingaben({ summe: 1000, offenePosten: 2, konflikte: 1, gegated: [] })).toStrictEqual({
      kind: 'spanne',
      von: 1000 - spread,
      bis: 1000 + spread,
      offenePosten: 2,
      konflikte: 1,
    })
  })

  it('names a gated Einkunftsart rather than widening into a fake range', () => {
    expect(cockpitSpanneAusEingaben({ summe: 500, offenePosten: 0, konflikte: 0, gegated: ['Gewerbe'] })).toStrictEqual({ kind: 'gated', summe: 500, gegated: ['Gewerbe'] })
  })
})
