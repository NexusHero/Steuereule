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

  it('statutory Kinderfreibetrag + BEA (§ 32 Abs. 6 EStG)', () => {
    // 2024: 6.384 + 2.928 = 9.312 €
    expect(kinderfreibetrag(2024)).toBe(9312)
    // 2025: 6.612 + 2.928 = 9.540 €
    expect(kinderfreibetrag(2025)).toBe(9540)
    // 2026: 6.828 + 2.928 = 9.756 €
    expect(kinderfreibetrag(2026)).toBe(9756)
  })

  it('monthly Kindergeld standard (§ 66 EStG: 250 € per child per month = 3000 € full year)', () => {
    expect(kindergeldAnspruchMonat(2025)).toBe(250)
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
    expect(stand.freibetragGesamt).toBe(19080)
  })
})
