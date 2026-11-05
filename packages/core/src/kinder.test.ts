import { describe, expect, it } from 'vitest'
import {
  berechneDifferenzkindergeld,
  calculateDifferentialChildBenefit,
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

  it('calculates Differenzkindergeld for Swiss family allowances (ADR-0054, #414)', () => {
    // 2025: 255 €/month = 3.060 €/year
    // Markus Brenner case: 2.580 CHF * 1.065 = 2.748 € Swiss allowance -> 312 € difference
    const ergebnis = berechneDifferenzkindergeld('2016-03-14', 2025, 2748)
    expect(ergebnis.statutoryClaim).toBe(3060)
    expect(ergebnis.swissAllowanceEur).toBe(2748)
    expect(ergebnis.differentialChildBenefit).toBe(312)
    expect(ergebnis.totalClaim).toBe(3060)

    // Swiss allowance higher than German Kindergeld: difference is 0, total claim is higher Swiss amount
    const hoehere = calculateDifferentialChildBenefit('2019-09-02', 2025, 3500)
    expect(hoehere.statutoryClaim).toBe(3060)
    expect(hoehere.differentialChildBenefit).toBe(0)
    expect(hoehere.totalClaim).toBe(3500)

    // Child born in October (3 months claim): 3 * 255 = 765 €, Swiss allowance 600 € -> difference 165 €
    const neugeboren = berechneDifferenzkindergeld('2025-10-15', 2025, 600)
    expect(neugeboren.statutoryClaim).toBe(765)
    expect(neugeboren.differentialChildBenefit).toBe(165)
    expect(neugeboren.totalClaim).toBe(765)

    expect(() => calculateDifferentialChildBenefit('2020-01-01', 2025, -10)).toThrow(RangeError)
  })

  it('integrates Swiss family allowances and Differenzkindergeld into KinderStand (ADR-0054, #414)', () => {
    // Scenario 2: Markus Brenner (Mia born 2016, Noah born 2019, 2.748 € Swiss allowance each)
    const kinder: KindDaten[] = [
      {
        id: 'mia',
        vorname: 'Mia',
        nachname: 'Brenner',
        geburtsdatum: '2016-03-14',
        steuerId: '41234567890',
        kindergeld: null,
        schweizerKinderzulageEur: 2748,
      },
      {
        id: 'noah',
        vorname: 'Noah',
        nachname: 'Brenner',
        geburtsdatum: '2019-09-02',
        steuerId: '41234567891',
        kindergeld: null,
        schweizerKinderzulageEur: 2748,
      },
    ]
    const stand = kinderStand(kinder, 2025)
    expect(stand.anzahl).toBe(2)
    expect(stand.schweizerKinderzulageSumme).toBe(2748 * 2) // 5.496 €
    expect(stand.differenzkindergeldSumme).toBe(312 * 2) // 624 €
    expect(stand.kindergeldSumme).toBe(3060 * 2) // 6.120 € total claim for Günstigerprüfung
    expect(stand.freibetragGesamt).toBe(9600 * 2) // 19.200 € Kinderfreibetrag + BEA
  })
})
