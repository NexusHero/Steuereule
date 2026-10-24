import { describe, expect, it } from 'vitest'
import { nehmeVorschlagAn, type KiVorschlag } from './ki-port'

// ADR-014/048 — the port contract. The deterministic core is fully testable with NO KiPort
// injected: `nehmeVorschlagAn` is a pure function over an already-materialized suggestion.
// The property under test: a Vorschlag is NOT a Posten until accepted, and acceptance
// attaches the "ki-vorschlag" origin so "jede Zahl trägt Herkunft" survives the step.

describe('nehmeVorschlagAn — a suggestion becomes a Posten only by acceptance (ADR-014)', () => {
  it('produces a Posten with the suggestion’s Einkunftsart and amount', () => {
    const vorschlag: KiVorschlag = { id: 'v1', einkunftsart: 'Vermietung', betrag: 480 }
    expect(nehmeVorschlagAn(vorschlag, 'p1')).toEqual({
      id: 'p1',
      einkunftsart: 'Vermietung',
      betrag: 480,
      quelle: { art: 'ki-vorschlag', vorschlagId: 'v1' },
    })
  })

  it('records the Beleg it was derived from, when one is present (ADR-014 "Beleg + KI-Vorschlag, bestätigt")', () => {
    const vorschlag: KiVorschlag = { id: 'v1', einkunftsart: 'Kapital', betrag: 123, belegId: 'b1' }
    expect(nehmeVorschlagAn(vorschlag, 'p1').quelle).toEqual({
      art: 'ki-vorschlag',
      vorschlagId: 'v1',
      belegId: 'b1',
    })
  })

  it('a suggestion without a Beleg carries no belegId on its Quelle', () => {
    const vorschlag: KiVorschlag = { id: 'v1', einkunftsart: 'Kapital', betrag: 123 }
    const posten = nehmeVorschlagAn(vorschlag, 'p1')
    expect('belegId' in posten.quelle).toBe(false)
  })
})
