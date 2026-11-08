import { describe, expect, it } from 'vitest'
import {
  EMPTY_PENSION,
  PENSION_TYPES,
  PENSION_UNCLEAR,
  taxableSharePercent,
  deserializePensionField,
  incomePortionPercent,
  isPensionType,
  pensionAsCoreLineItem,
  pensionStatus,
  serializePensionField,
  setPensionType,
  setPensionField,
  usedTaxableShare,
  type PensionData,
} from './pension'

// product ADR-034/036 §3 — the Rentner vertical. The load-bearing properties: (1) the two
// statutory percentage tables are VERBATIM (product ADR-032 — no invented percentages), so the
// tests pin the law's own boundary values rather than a computed shape; (2) the fold is OFFEN
// (never a fabricated zero) whenever the taxable share is not determinable — no art chosen, a
// required field open/unklar, or a Rentenbeginn-Jahr outside the statutory table.

describe('isRentenart / RENTENARTEN — the five pension kinds (product ADR-036 §3)', () => {
  it('declares exactly the five 1.0 rentenarten, in canonical order', () => {
    expect(PENSION_TYPES).toEqual([
      'GesetzlicheRente',
      'Betriebsrente',
      'PrivateRentenversicherung',
      'WitwenWaisenrente',
      'AuslaendischeRente',
    ])
  })

  it('accepts every declared Rentenart and rejects anything else, total over string', () => {
    for (const kind of PENSION_TYPES) expect(isPensionType(kind)).toBe(true)
    expect(isPensionType('Rente')).toBe(false) // the Einkunftsart, not the Rentenart
    expect(isPensionType('')).toBe(false)
    expect(isPensionType('gesetzliche Rente')).toBe(false)
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
  ] as const)('rentenbeginn %d → %d %%', (year, percent) => {
    expect(taxableSharePercent(year)).toBe(percent)
  })

  it('a year beyond the table (after 2058) is OFFEN, never guessed', () => {
    expect(taxableSharePercent(2059)).toBeNull()
    expect(taxableSharePercent(2100)).toBeNull()
  })

  it('a non-integer or negative year is OFFEN, never guessed', () => {
    expect(taxableSharePercent(2026.5)).toBeNull()
    expect(taxableSharePercent(-1)).toBeNull()
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
  ] as const)('vollendetes Lebensjahr %d → %d %%', (alter, percent) => {
    expect(incomePortionPercent(alter)).toBe(percent)
  })

  it('a negative or non-integer age is OFFEN, never guessed', () => {
    expect(incomePortionPercent(-1)).toBeNull()
    expect(incomePortionPercent(65.5)).toBeNull()
  })
})

describe('verwendetBesteuerungsanteil — which statutory table a Rentenart is taxed through', () => {
  it('everything except the private Rentenversicherung uses the Besteuerungsanteil', () => {
    expect(usedTaxableShare('GesetzlicheRente')).toBe(true)
    expect(usedTaxableShare('Betriebsrente')).toBe(true)
    expect(usedTaxableShare('WitwenWaisenrente')).toBe(true)
    expect(usedTaxableShare('AuslaendischeRente')).toBe(true)
    expect(usedTaxableShare('PrivateRentenversicherung')).toBe(false)
  })
})

function pension(overrides: Partial<PensionData> = {}): PensionData {
  return { ...EMPTY_PENSION, ...overrides }
}

describe('renteAlsKernposten — the taxable share, with Herkunft, offen where offen', () => {
  it('gesetzliche Rente, Rentenbeginn 2020 → 80 % taxable, citing aa', () => {
    const items = pensionAsCoreLineItem(
      pension({
        kind: 'GesetzlicheRente',
        jahresbetrag: { kind: 'erfasst', value: 20000 },
        rentenbeginnJahr: { kind: 'erfasst', value: 2020 },
      }),
    )
    expect(items).toEqual({
      id: 'rente',
      incomeType: 'Rente',
      amount: 16000,
      source: { kind: 'regel', rule: '§ 22 Nr. 1 Satz 3 Buchst. a Doppelbuchst. aa EStG — Besteuerungsanteil bei Rentenbeginn 2020: 80 %' },
    })
  })

  it('Betriebsrente, Rentenbeginn 2026 → 84 % taxable (the half-point phase)', () => {
    const items = pensionAsCoreLineItem(
      pension({
        kind: 'Betriebsrente',
        jahresbetrag: { kind: 'erfasst', value: 12000 },
        rentenbeginnJahr: { kind: 'erfasst', value: 2026 },
      }),
    )
    expect(items?.amount).toBe(10080) // 12000 × 0.84
    expect(items?.source).toEqual({
      kind: 'regel',
      rule: '§ 22 Nr. 1 Satz 3 Buchst. a Doppelbuchst. aa EStG — Besteuerungsanteil bei Rentenbeginn 2026: 84 %',
    })
  })

  it('private Rentenversicherung, Rentenbeginn mit 65 → 18 % Ertragsanteil, citing bb', () => {
    const items = pensionAsCoreLineItem(
      pension({
        kind: 'PrivateRentenversicherung',
        jahresbetrag: { kind: 'erfasst', value: 10000 },
        alterBeiRentenbeginn: { kind: 'erfasst', value: 65 },
      }),
    )
    expect(items).toEqual({
      id: 'rente',
      incomeType: 'Rente',
      amount: 1800,
      source: { kind: 'regel', rule: '§ 22 Nr. 1 Satz 3 Buchst. a Doppelbuchst. bb EStG — Ertragsanteil bei Rentenbeginn mit 65 Jahren: 18 %' },
    })
  })

  it('no art chosen, or an open/unklar Jahresbetrag → null (offen, never a zero)', () => {
    expect(pensionAsCoreLineItem(pension())).toBeNull()
    expect(pensionAsCoreLineItem(pension({ kind: 'GesetzlicheRente' }))).toBeNull()
    expect(
      pensionAsCoreLineItem(pension({ kind: 'GesetzlicheRente', jahresbetrag: { kind: 'unklar' }, rentenbeginnJahr: { kind: 'erfasst', value: 2020 } })),
    ).toBeNull()
  })

  it('a missing Rentenbeginn-Jahr (Besteuerungsanteil path) is offen', () => {
    expect(pensionAsCoreLineItem(pension({ kind: 'GesetzlicheRente', jahresbetrag: { kind: 'erfasst', value: 20000 } }))).toBeNull()
  })

  it('a Rentenbeginn-Jahr outside the table is offen, never guessed', () => {
    expect(
      pensionAsCoreLineItem(
        pension({ kind: 'GesetzlicheRente', jahresbetrag: { kind: 'erfasst', value: 20000 }, rentenbeginnJahr: { kind: 'erfasst', value: 2070 } }),
      ),
    ).toBeNull()
  })

  it('a missing Rentenbeginn-Lebensalter (Ertragsanteil path) is offen', () => {
    expect(pensionAsCoreLineItem(pension({ kind: 'PrivateRentenversicherung', jahresbetrag: { kind: 'erfasst', value: 10000 } }))).toBeNull()
  })
})

describe('renteStand — the fold into the deterministic core', () => {
  it('a determinable rente is bestimmt with the taxable share as einnahmen', () => {
    const status = pensionStatus(
      pension({ kind: 'GesetzlicheRente', jahresbetrag: { kind: 'erfasst', value: 20000 }, rentenbeginnJahr: { kind: 'erfasst', value: 2020 } }),
      [],
    )
    expect(status).toEqual({ kind: 'bestimmt', einnahmen: 16000, vorsorgeaufwand: 0, anrechnung: 0 })
  })

  it('an open rente is offen with one open posten — never a fabricated zero', () => {
    const status = pensionStatus(pension(), [])
    expect(status).toEqual({ kind: 'offen', einnahmen: 0, vorsorgeaufwand: 0, anrechnung: 0, openItems: 1, conflicts: 0, gated: [], unconfirmedItems: 0, unconfirmedSum: 0 })
  })

  it('a gated Einkunftsart is named, keeping the result offen (ADR-030/034 combinability)', () => {
    const status = pensionStatus(
      pension({ kind: 'GesetzlicheRente', jahresbetrag: { kind: 'erfasst', value: 20000 }, rentenbeginnJahr: { kind: 'erfasst', value: 2020 } }),
      ['Gewerbe'],
    )
    expect(status).toEqual({ kind: 'offen', einnahmen: 16000, vorsorgeaufwand: 0, anrechnung: 0, openItems: 0, conflicts: 0, gated: ['Gewerbe'], unconfirmedItems: 0, unconfirmedSum: 0 })
  })
})

describe('setzeRentenFeld / setzeRentenart — the one setters', () => {
  it('setzeRentenFeld replaces one field and leaves the rest untouched', () => {
    const next = setPensionField(EMPTY_PENSION, 'jahresbetrag', { kind: 'erfasst', value: 20000 })
    expect(next.jahresbetrag).toEqual({ kind: 'erfasst', value: 20000 })
    expect(next.rentenbeginnJahr).toEqual({ kind: 'offen' })
  })

  it('rejects an invalid erfasst value (negative / non-integer)', () => {
    expect(() => setPensionField(EMPTY_PENSION, 'jahresbetrag', { kind: 'erfasst', value: -5 })).toThrow(RangeError)
    expect(() => setPensionField(EMPTY_PENSION, 'jahresbetrag', { kind: 'erfasst', value: 1.5 })).toThrow(RangeError)
  })

  it('setzeRentenart sets a declared art and rejects an undeclared one', () => {
    expect(setPensionType(EMPTY_PENSION, 'GesetzlicheRente').kind).toBe('GesetzlicheRente')
    expect(setPensionType(EMPTY_PENSION, null).kind).toBeNull()
    expect(() => setPensionType(EMPTY_PENSION, 'Rente' as never)).toThrow(RangeError)
  })
})

describe('serialisiereRentenFeld / deserialisiereRentenFeld — the one encoding', () => {
  it('round-trips offen / unklar / erfasst', () => {
    expect(serializePensionField({ kind: 'offen' })).toBeNull()
    expect(serializePensionField({ kind: 'unklar' })).toBe(PENSION_UNCLEAR)
    expect(serializePensionField({ kind: 'erfasst', value: 2020 })).toBe('2020')

    expect(deserializePensionField(null)).toEqual({ kind: 'offen' })
    expect(deserializePensionField('unklar')).toEqual({ kind: 'unklar' })
    expect(deserializePensionField('2020')).toEqual({ kind: 'erfasst', value: 2020 })
  })

  it('a stored value that is neither offen, unklar, nor a valid integer is corruption — throw', () => {
    expect(() => deserializePensionField('abc')).toThrow(/neither offen, unklar/)
  })
})
