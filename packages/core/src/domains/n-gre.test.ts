import { describe, expect, it } from 'vitest'
import { annexNGreAmounts, type NGreInput } from './n-gre'

const INPUT: NGreInput = {
  grossWageChf: 100000,
  familienzulagenChf: 2400,
  ahvContributionsChf: 6600,
  withholdingTaxChf: 4500,
  krankentaggeldChf: 300,
  pkArbeitnehmerChf: 5000,
  pkArbeitgeberChf: 6000,
  rate: 1.065,
}

describe('Anlage N-Gre — Arbeitslohn and the Swiss social contributions (Zeilen 6–25, 75–88)', () => {
  it('derives the wage lines: Familienzulagen are tax-free, the Abzugssteuer is capped at 4,5 %', () => {
    const { chf } = annexNGreAmounts(INPUT)
    expect(chf).toMatchObject({ z6: 100000, z8: 2400, z15: 97600, z23: 97600, z25: 4500 })
    expect(annexNGreAmounts({ ...INPUT, withholdingTaxChf: 9000 }).chf.z25).toBe(4500)
  })

  it('applies the rates printed on the form to the Bemessungsgrundlage (Zeile 77)', () => {
    const { chf } = annexNGreAmounts(INPUT)
    expect(chf).toMatchObject({ z75: 100000, z76: 2400, z77: 97600, z78: 244, z79: 1074, z83: 4929 })
  })

  it('NBUV is what Ziffer 9 holds beyond AHV/IV/EO/ALV; half of it counts (Zeile 81)', () => {
    const { chf } = annexNGreAmounts(INPUT)
    // 6600 − (4929 + 244 + 1074) = 353 → 50 % = 177
    expect(chf).toMatchObject({ z80: 300, z81: 177, z82: 244 + 1074 + 300 + 177 })
    expect(annexNGreAmounts({ ...INPUT, ahvContributionsChf: 5000 }).chf.z81).toBe(0)
  })

  it('sums the employee and employer contributions (Kz 300 / Kz 304)', () => {
    const { chf } = annexNGreAmounts(INPUT)
    expect(chf).toMatchObject({ z84: 5000, z85: 4929 + 5000, z86: 4929, z87: 6000, z88: 4929 + 6000 })
  })

  it('caps the ALV base at 148.200 CHF', () => {
    expect(annexNGreAmounts({ ...INPUT, grossWageChf: 200000, familienzulagenChf: 0 }).chf.z79).toBe(1630)
  })

  it('converts every line with the Kurs and keeps the EUR sums consistent with their parts', () => {
    const { eur } = annexNGreAmounts(INPUT)
    expect(eur.z6).toBe(106500)
    expect(eur.z15).toBe(eur.z6 - eur.z8)
    expect(eur.z82).toBe(eur.z78 + eur.z79 + eur.z80 + eur.z81)
    expect(eur.z85).toBe(eur.z83 + eur.z84)
    expect(eur.z88).toBe(eur.z86 + eur.z87)
  })

describe('Anlage N-Gre — employer share of Krankentaggeld and NBUV (Zeilen 18, 19, 80, 81, 95–98)', () => {
  it('without an employer share nothing changes', () => {
    const without = annexNGreAmounts(INPUT)
    const withZero = annexNGreAmounts({ ...INPUT, krankentaggeldArbeitgeberProzent: 0, nbuvArbeitgeberProzent: 0 })
    expect(withZero.chf).toEqual(without.chf)
    expect(without.chf).toMatchObject({ z18: 0, z19: 0 })
  })

  it('derives the employer CHF from the employee contribution and the percentages (10 % / 90 %)', () => {
    // Employee pays 900 CHF = 90 % → employer 100 CHF = 10 %.
    const { chf, split } = annexNGreAmounts({ ...INPUT, krankentaggeldChf: 900, krankentaggeldArbeitgeberProzent: 10 })
    expect(split.dailySicknessAllowance).toEqual({ employerPercent: 10, employeePercent: 90, employerChf: 100, employeeChf: 900 })
    // The employer part is taxable wage (Z. 18 → Z. 23) and counts as a contribution (Z. 80).
    expect(chf).toMatchObject({ z18: 100, z15: 97600, z23: 97700, z80: 1000 })
  })

  it('adds the employer NBUV share to the wage (Z. 19) and halves the full NBUV contribution (Z. 81)', () => {
    // Employee NBUV 353 CHF (see above) at 50 % → employer 353 CHF.
    const { chf, split } = annexNGreAmounts({ ...INPUT, nbuvArbeitgeberProzent: 50 })
    expect(split.nbuv).toEqual({ employerPercent: 50, employeePercent: 50, employerChf: 353, employeeChf: 353 })
    expect(chf).toMatchObject({ z19: 353, z23: 97600 + 353, z81: 353 })
  })

  it('takes the employer CHF as given when the employer pays everything (100 %)', () => {
    const { chf, split } = annexNGreAmounts({
      ...INPUT,
      krankentaggeldChf: 0,
      krankentaggeldArbeitgeberProzent: 100,
      krankentaggeldArbeitgeberChf: 1200,
    })
    expect(split.dailySicknessAllowance).toEqual({ employerPercent: 100, employeePercent: 0, employerChf: 1200, employeeChf: 0 })
    expect(chf).toMatchObject({ z18: 1200, z80: 1200 })
  })

  it('converts the new lines to EUR like every other line', () => {
    const { eur } = annexNGreAmounts({ ...INPUT, krankentaggeldChf: 900, krankentaggeldArbeitgeberProzent: 10 })
    expect(eur).toMatchObject({ z18: Math.round(100 * 1.065), z80: Math.round(1000 * 1.065) })
  })
})
})
