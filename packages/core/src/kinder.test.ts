import { describe, expect, it } from 'vitest'
import {
  istGueltigesKindGeburtsdatum,
  kinderfreibetrag,
  kindergeldAnspruchMonat,
  kinderStand,
  type KindDaten,
} from './kinder.js'

describe('kinder', () => {
  it('validates child birthdate (not in the future, valid calendar date)', () => {
    expect(istGueltigesKindGeburtsdatum('2018-05-14', 2025)).toBe(true)
    expect(istGueltigesKindGeburtsdatum('2026-01-01', 2025)).toBe(false)
    expect(istGueltigesKindGeburtsdatum('invalid', 2025)).toBe(false)
  })

  it('statutory Kinderfreibetrag + BEA (§ 32 Abs. 6 EStG), both parents together', () => {
    // 2024 after the retroactive raise: 6.612 + 2.928
    expect(kinderfreibetrag(2024)).toBe(9540)
    expect(kinderfreibetrag(2025)).toBe(6672 + 2928)
    expect(kinderfreibetrag(2026)).toBe(6828 + 2928)
  })

  it('monthly Kindergeld (§ 66 EStG): 250 € through 2024, 255 € in 2025, 259 € from 2026', () => {
    expect(kindergeldAnspruchMonat(2024)).toBe(250)
    expect(kindergeldAnspruchMonat(2025)).toBe(255)
    expect(kindergeldAnspruchMonat(2026)).toBe(259)
  })

  it('a child born in the year counts from its birth month (§ 32 Abs. 6 Satz 5, § 66 Abs. 2 EStG)', () => {
    const neugeboren: KindDaten = { id: 'k', vorname: 'Ida', nachname: 'M', geburtsdatum: '2025-10-20', steuerId: null, kindergeld: null }
    const stand = kinderStand([neugeboren], 2025)
    expect(stand.kindergeldSumme).toBe(3 * 255)
    expect(stand.freibetragGesamt).toBe(Math.round((9600 * 3) / 12))
  })

  it('folds child facts into deterministic count and figures', () => {
    const kinder: KindDaten[] = [
      {
        id: 'k-1',
        vorname: 'Mia',
        nachname: 'Muster',
        geburtsdatum: '2019-04-12',
        steuerId: '12345678901',
        kindergeld: 3000,
      },
      {
        id: 'k-2',
        vorname: 'Ben',
        nachname: 'Muster',
        geburtsdatum: '2022-09-01',
        steuerId: null,
        kindergeld: 3000,
      },
    ]
    const stand = kinderStand(kinder, 2025)
    expect(stand.anzahl).toBe(2)
    expect(stand.kindergeldSumme).toBe(6000)
    expect(stand.freibetragGesamt).toBe(2 * 9600)
  })
})
