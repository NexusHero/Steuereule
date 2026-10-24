import { describe, expect, it } from 'vitest'
import {
  berechne,
  loeseKonflikt,
  type BerechnungsInput,
  type Posten,
  type PostenKonflikt,
  type Quelle,
} from './berechnung'

// ADR-014/015/048/008/032 — the deterministic core. The load-bearing property: a
// determined amount is emitted ONLY when nothing is open, conflicting or gated; otherwise
// the result is `offen` and NAMES what blocks it. Never a guess. A conflicting Posten is
// excluded from the sum (ADR-008), and a gated Einkunftsart is named, not silently
// dropped (ADR-032).

const angestellt: Posten = { id: 'p1', einkunftsart: 'Nichtselbstständig', betrag: 1407, quelle: { art: 'eingabe' } }

function input(overrides: Partial<BerechnungsInput> = {}): BerechnungsInput {
  return {
    posten: [],
    offenePosten: 0,
    konflikte: [],
    gegated: [],
    ...overrides,
  }
}

describe('berechne — the honest fold', () => {
  it('sums settled Posten and is `bestimmt` when nothing is open, conflicting or gated', () => {
    const stand = berechne(input({ posten: [angestellt, { ...angestellt, id: 'p2', betrag: 593 }] }))
    expect(stand).toEqual({ kind: 'bestimmt', summe: 2000 })
  })

  it('is `offen` and NAMES the open count when a required Posten is still empty', () => {
    const stand = berechne(input({ posten: [angestellt], offenePosten: 2 }))
    expect(stand).toEqual({ kind: 'offen', summe: 1407, offenePosten: 2, konflikte: 0, gegated: [] })
  })

  it('is `offen` and names a conflict count, and the conflicting Posten is NOT in the sum (ADR-008)', () => {
    const konflikt: PostenKonflikt = {
      postenId: 'p-conflict',
      einkunftsart: 'Kapital',
      quellen: [
        { art: 'beleg', belegId: 'b1', betrag: 480 },
        { art: 'eingabe', betrag: 500 },
      ],
    }
    const stand = berechne(input({ posten: [angestellt], konflikte: [konflikt] }))
    expect(stand).toEqual({ kind: 'offen', summe: 1407, offenePosten: 0, konflikte: 1, gegated: [] })
  })

  it('is `offen` and names the gated Einkunftsarten (ADR-032: declared but not computable)', () => {
    const stand = berechne(input({ posten: [angestellt], gegated: ['Gewerbe'] }))
    expect(stand).toEqual({ kind: 'offen', summe: 1407, offenePosten: 0, konflikte: 0, gegated: ['Gewerbe'] })
  })

  it('`bestimmt` collapses the moment the last blocker clears — the honest point value (ADR-015)', () => {
    const offen = berechne(input({ posten: [angestellt], offenePosten: 1 }))
    expect(offen.kind).toBe('offen')
    const bestimmt = berechne(input({ posten: [angestellt], offenePosten: 0 }))
    expect(bestimmt).toEqual({ kind: 'bestimmt', summe: 1407 })
  })

  it('the `offen` summe is a partial truth stated as a partial truth — settled Posten only', () => {
    const stand = berechne(input({ posten: [angestellt], offenePosten: 1, gegated: ['Gewerbe'] }))
    expect(stand.kind).toBe('offen')
    if (stand.kind === 'offen') expect(stand.summe).toBe(1407) // no invented amount for the open/gated part
  })

  it('rejects a negative offenePosten and a negative Posten betrag loudly', () => {
    expect(() => berechne(input({ offenePosten: -1 }))).toThrow(RangeError)
    expect(() => berechne(input({ posten: [{ ...angestellt, betrag: -5 }] }))).toThrow(RangeError)
  })
})

describe('loeseKonflikt — ADR-008 resolution is explicit, never silent', () => {
  const konflikt: PostenKonflikt = {
    postenId: 'p-conflict',
    einkunftsart: 'Kapital',
    quellen: [
      { art: 'beleg', belegId: 'b1', betrag: 480 },
      { art: 'eingabe', betrag: 500 },
    ],
  }

  it('"eine Quelle wählen" keeps that source’s amount AND origin', () => {
    const posten = loeseKonflikt(konflikt, { art: 'quelle-waehlen', quelle: { art: 'beleg', belegId: 'b1' }, betrag: 480 })
    expect(posten).toEqual({ id: 'p-conflict', einkunftsart: 'Kapital', betrag: 480, quelle: { art: 'beleg', belegId: 'b1' } })
  })

  it('"Wert korrigieren" produces a fresh manual entry (origin eingabe)', () => {
    const posten = loeseKonflikt(konflikt, { art: 'wert-korrigieren', betrag: 490 })
    expect(posten).toEqual({ id: 'p-conflict', einkunftsart: 'Kapital', betrag: 490, quelle: { art: 'eingabe' } })
  })

  it('rejects a negative corrected value', () => {
    expect(() => loeseKonflikt(konflikt, { art: 'wert-korrigieren', betrag: -1 })).toThrow(RangeError)
  })
})

describe('Quelle — every number carries Herkunft (ADR-014/015)', () => {
  it('the ki-vorschlag Quelle records the suggestion id and the Beleg it came from', () => {
    const quelle: Quelle = { art: 'ki-vorschlag', vorschlagId: 'v1', belegId: 'b1' }
    expect(quelle).toEqual({ art: 'ki-vorschlag', vorschlagId: 'v1', belegId: 'b1' })
  })
})
