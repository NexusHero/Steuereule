import { describe, expect, it } from 'vitest'
import {
  LEERE_RENTE,
  RENTENARTEN,
  RENTE_UNKLAR,
  besteuerungsanteilProzent,
  deserialisiereRentenFeld,
  ertragsanteilProzent,
  isRentenart,
  renteAlsKernposten,
  renteStand,
  serialisiereRentenFeld,
  setzeRentenart,
  setzeRentenFeld,
  verwendetBesteuerungsanteil,
  type RentenDaten,
} from './rente'

// product ADR-034/036 §3 — the Rentner vertical. The load-bearing properties: (1) the two
// statutory percentage tables are VERBATIM (product ADR-032 — no invented percentages), so the
// tests pin the law's own boundary values rather than a computed shape; (2) the fold is OFFEN
// (never a fabricated zero) whenever the taxable share is not determinable — no art chosen, a
// required field open/unklar, or a Rentenbeginn-Jahr outside the statutory table.

describe('isRentenart / RENTENARTEN — the five pension kinds (product ADR-036 §3)', () => {
  it('declares exactly the five 1.0 rentenarten, in canonical order', () => {
    expect(RENTENARTEN).toEqual([
      'GesetzlicheRente',
      'Betriebsrente',
      'PrivateRentenversicherung',
      'WitwenWaisenrente',
      'AuslaendischeRente',
    ])
  })

  it('accepts every declared Rentenart and rejects anything else, total over string', () => {
    for (const art of RENTENARTEN) expect(isRentenart(art)).toBe(true)
    expect(isRentenart('Rente')).toBe(false) // the Einkunftsart, not the Rentenart
    expect(isRentenart('')).toBe(false)
    expect(isRentenart('gesetzliche Rente')).toBe(false)
  })
})

describe('besteuerungsanteilProzent — the Kohorten-Tabelle (aa), verbatim', () => {
  it.each([
    [2005, 50], // the table's first row ("bis 2005")
    [2000, 50], // any year before 2005 falls into "bis 2005"
    [2006, 52],
    [2020, 80], // end of the +2 pp phase
    [2021, 81], // +1 pp
    [2022, 82], // +1 pp
    [2023, 82.5], // +0.5 pp phase begins (Wachstumschancengesetz)
    [2026, 84],
    [2040, 91],
    [2057, 99.5],
    [2058, 100], // the table's terminal row
  ] as const)('rentenbeginn %d → %d %%', (jahr, prozent) => {
    expect(besteuerungsanteilProzent(jahr)).toBe(prozent)
  })

  it('a year beyond the table (after 2058) is OFFEN, never guessed', () => {
    expect(besteuerungsanteilProzent(2059)).toBeNull()
    expect(besteuerungsanteilProzent(2100)).toBeNull()
  })

  it('a non-integer or negative year is OFFEN, never guessed', () => {
    expect(besteuerungsanteilProzent(2026.5)).toBeNull()
    expect(besteuerungsanteilProzent(-1)).toBeNull()
  })
})

describe('ertragsanteilProzent — the Ertragsanteil-Tabelle (bb), verbatim', () => {
  it.each([
    [0, 59],
    [1, 59],
    [2, 58],
    [27, 46],
    [50, 30],
    [65, 18],
    [80, 8],
    [96, 2],
    [97, 1], // the "ab 97" terminal row
    [120, 1], // everything above 96 is the terminal row
  ] as const)('vollendetes Lebensjahr %d → %d %%', (alter, prozent) => {
    expect(ertragsanteilProzent(alter)).toBe(prozent)
  })

  it('a negative or non-integer age is OFFEN, never guessed', () => {
    expect(ertragsanteilProzent(-1)).toBeNull()
    expect(ertragsanteilProzent(65.5)).toBeNull()
  })
})

describe('verwendetBesteuerungsanteil — which statutory table a Rentenart is taxed through', () => {
  it('everything except the private Rentenversicherung uses the Besteuerungsanteil', () => {
    expect(verwendetBesteuerungsanteil('GesetzlicheRente')).toBe(true)
    expect(verwendetBesteuerungsanteil('Betriebsrente')).toBe(true)
    expect(verwendetBesteuerungsanteil('WitwenWaisenrente')).toBe(true)
    expect(verwendetBesteuerungsanteil('AuslaendischeRente')).toBe(true)
    expect(verwendetBesteuerungsanteil('PrivateRentenversicherung')).toBe(false)
  })
})

function rente(overrides: Partial<RentenDaten> = {}): RentenDaten {
  return { ...LEERE_RENTE, ...overrides }
}

describe('renteAlsKernposten — the taxable share, with Herkunft, offen where offen', () => {
  it('gesetzliche Rente, Rentenbeginn 2020 → 80 % taxable, citing aa', () => {
    const posten = renteAlsKernposten(
      rente({
        art: 'GesetzlicheRente',
        jahresbetrag: { kind: 'erfasst', wert: 20000 },
        rentenbeginnJahr: { kind: 'erfasst', wert: 2020 },
      }),
    )
    expect(posten).toEqual({
      id: 'rente',
      einkunftsart: 'Rente',
      betrag: 16000,
      quelle: { art: 'regel', regel: '§ 22 Nr. 1 Satz 3 Buchst. a Doppelbuchst. aa EStG — Besteuerungsanteil bei Rentenbeginn 2020: 80 %' },
    })
  })

  it('Betriebsrente, Rentenbeginn 2026 → 84 % taxable (the half-point phase)', () => {
    const posten = renteAlsKernposten(
      rente({
        art: 'Betriebsrente',
        jahresbetrag: { kind: 'erfasst', wert: 12000 },
        rentenbeginnJahr: { kind: 'erfasst', wert: 2026 },
      }),
    )
    expect(posten?.betrag).toBe(10080) // 12000 × 0.84
    expect(posten?.quelle).toEqual({
      art: 'regel',
      regel: '§ 22 Nr. 1 Satz 3 Buchst. a Doppelbuchst. aa EStG — Besteuerungsanteil bei Rentenbeginn 2026: 84 %',
    })
  })

  it('private Rentenversicherung, Rentenbeginn mit 65 → 18 % Ertragsanteil, citing bb', () => {
    const posten = renteAlsKernposten(
      rente({
        art: 'PrivateRentenversicherung',
        jahresbetrag: { kind: 'erfasst', wert: 10000 },
        alterBeiRentenbeginn: { kind: 'erfasst', wert: 65 },
      }),
    )
    expect(posten).toEqual({
      id: 'rente',
      einkunftsart: 'Rente',
      betrag: 1800,
      quelle: { art: 'regel', regel: '§ 22 Nr. 1 Satz 3 Buchst. a Doppelbuchst. bb EStG — Ertragsanteil bei Rentenbeginn mit 65 Jahren: 18 %' },
    })
  })

  it('no art chosen, or an open/unklar Jahresbetrag → null (offen, never a zero)', () => {
    expect(renteAlsKernposten(rente())).toBeNull()
    expect(renteAlsKernposten(rente({ art: 'GesetzlicheRente' }))).toBeNull()
    expect(
      renteAlsKernposten(rente({ art: 'GesetzlicheRente', jahresbetrag: { kind: 'unklar' }, rentenbeginnJahr: { kind: 'erfasst', wert: 2020 } })),
    ).toBeNull()
  })

  it('a missing Rentenbeginn-Jahr (Besteuerungsanteil path) is offen', () => {
    expect(renteAlsKernposten(rente({ art: 'GesetzlicheRente', jahresbetrag: { kind: 'erfasst', wert: 20000 } }))).toBeNull()
  })

  it('a Rentenbeginn-Jahr outside the table is offen, never guessed', () => {
    expect(
      renteAlsKernposten(
        rente({ art: 'GesetzlicheRente', jahresbetrag: { kind: 'erfasst', wert: 20000 }, rentenbeginnJahr: { kind: 'erfasst', wert: 2070 } }),
      ),
    ).toBeNull()
  })

  it('a missing Rentenbeginn-Lebensalter (Ertragsanteil path) is offen', () => {
    expect(renteAlsKernposten(rente({ art: 'PrivateRentenversicherung', jahresbetrag: { kind: 'erfasst', wert: 10000 } }))).toBeNull()
  })
})

describe('renteStand — the fold into the deterministic core', () => {
  it('a determinable rente is bestimmt with the taxable share as einnahmen', () => {
    const stand = renteStand(
      rente({ art: 'GesetzlicheRente', jahresbetrag: { kind: 'erfasst', wert: 20000 }, rentenbeginnJahr: { kind: 'erfasst', wert: 2020 } }),
      [],
    )
    expect(stand).toEqual({ kind: 'bestimmt', einnahmen: 16000, vorsorgeaufwand: 0, anrechnung: 0 })
  })

  it('an open rente is offen with one open posten — never a fabricated zero', () => {
    const stand = renteStand(rente(), [])
    expect(stand).toEqual({ kind: 'offen', einnahmen: 0, vorsorgeaufwand: 0, anrechnung: 0, offenePosten: 1, konflikte: 0, gegated: [], unbestaetigte: 0, unbestaetigteSumme: 0 })
  })

  it('a gated Einkunftsart is named, keeping the result offen (ADR-030/034 combinability)', () => {
    const stand = renteStand(
      rente({ art: 'GesetzlicheRente', jahresbetrag: { kind: 'erfasst', wert: 20000 }, rentenbeginnJahr: { kind: 'erfasst', wert: 2020 } }),
      ['Gewerbe'],
    )
    expect(stand).toEqual({ kind: 'offen', einnahmen: 16000, vorsorgeaufwand: 0, anrechnung: 0, offenePosten: 0, konflikte: 0, gegated: ['Gewerbe'], unbestaetigte: 0, unbestaetigteSumme: 0 })
  })
})

describe('setzeRentenFeld / setzeRentenart — the one setters', () => {
  it('setzeRentenFeld replaces one field and leaves the rest untouched', () => {
    const next = setzeRentenFeld(LEERE_RENTE, 'jahresbetrag', { kind: 'erfasst', wert: 20000 })
    expect(next.jahresbetrag).toEqual({ kind: 'erfasst', wert: 20000 })
    expect(next.rentenbeginnJahr).toEqual({ kind: 'offen' })
  })

  it('rejects an invalid erfasst value (negative / non-integer)', () => {
    expect(() => setzeRentenFeld(LEERE_RENTE, 'jahresbetrag', { kind: 'erfasst', wert: -5 })).toThrow(RangeError)
    expect(() => setzeRentenFeld(LEERE_RENTE, 'jahresbetrag', { kind: 'erfasst', wert: 1.5 })).toThrow(RangeError)
  })

  it('setzeRentenart sets a declared art and rejects an undeclared one', () => {
    expect(setzeRentenart(LEERE_RENTE, 'GesetzlicheRente').art).toBe('GesetzlicheRente')
    expect(setzeRentenart(LEERE_RENTE, null).art).toBeNull()
    expect(() => setzeRentenart(LEERE_RENTE, 'Rente' as never)).toThrow(RangeError)
  })
})

describe('serialisiereRentenFeld / deserialisiereRentenFeld — the one encoding', () => {
  it('round-trips offen / unklar / erfasst', () => {
    expect(serialisiereRentenFeld({ kind: 'offen' })).toBeNull()
    expect(serialisiereRentenFeld({ kind: 'unklar' })).toBe(RENTE_UNKLAR)
    expect(serialisiereRentenFeld({ kind: 'erfasst', wert: 2020 })).toBe('2020')

    expect(deserialisiereRentenFeld(null)).toEqual({ kind: 'offen' })
    expect(deserialisiereRentenFeld('unklar')).toEqual({ kind: 'unklar' })
    expect(deserialisiereRentenFeld('2020')).toEqual({ kind: 'erfasst', wert: 2020 })
  })

  it('a stored value that is neither offen, unklar, nor a valid integer is corruption — throw', () => {
    expect(() => deserialisiereRentenFeld('abc')).toThrow(/neither offen, unklar/)
  })
})
