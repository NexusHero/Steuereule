import { describe, expect, it } from 'vitest'
import {
  assetSchedule,
  buildingRate,
  degressiveRate,
  depreciationForYear,
  investmentDeadlineYear,
  lowValueTreatment,
  maxInvestmentDeduction,
  poolSchedule,
  settleInvestmentDeduction,
  USEFUL_LIVES,
} from './depreciation'

describe('low value assets (§ 6 Abs. 2, 2a EStG)', () => {
  it('sorts by the year choice: 250 € at once, GWG up to 800 €, pool up to 1.000 €', () => {
    expect(lowValueTreatment(250, 'gwg')).toBe('sofort')
    expect(lowValueTreatment(800, 'gwg')).toBe('gwg')
    expect(lowValueTreatment(800.01, 'gwg')).toBe('aktivieren')
    expect(lowValueTreatment(999, 'sammelposten')).toBe('sammelposten')
    expect(lowValueTreatment(1000.01, 'sammelposten')).toBe('aktivieren')
  })

  it('releases the pool by fifths over five years', () => {
    // 2.345,67 € / 5 = 469,13 € (rounded); the last fifth takes the rest: 2.345,67 − 4 × 469,13 = 469,15 €.
    expect(poolSchedule(2024, 2345.67)).toEqual([
      { year: 2024, amountEur: 469.13 },
      { year: 2025, amountEur: 469.13 },
      { year: 2026, amountEur: 469.13 },
      { year: 2027, amountEur: 469.13 },
      { year: 2028, amountEur: 469.15 },
    ])
  })
})

describe('linear AfA (§ 7 Abs. 1 EStG)', () => {
  it('runs by months from the acquisition month', () => {
    // Pkw 36.000 €, 6 years (AfA-Tabelle AV 4.2.1), bought 15.10.2023: 6.000 € a year, 3/12 = 1.500 € in 2023.
    const rows = assetSchedule({ id: 'car', acquired: '2023-10-15', netCostEur: 36_000, method: 'linear', usefulLifeYears: USEFUL_LIVES.car.years }, 2029)
    expect(rows.map((r) => r.depreciationEur)).toEqual([1500, 6000, 6000, 6000, 6000, 6000, 4500])
    expect(rows.at(-1)?.closingBookValueEur).toBe(0)
  })

  it('writes computer hardware off in the acquisition year (BMF 22.02.2022 Tz. 1.4)', () => {
    const laptop = { id: 'laptop', acquired: '2022-11-03', netCostEur: 1_800, method: 'linear' as const, usefulLifeYears: USEFUL_LIVES.computer.years }
    expect(assetSchedule(laptop, 2023).map((r) => r.depreciationEur)).toEqual([1800, 0])
    // By months instead: 2/12 in 2022 = 300 €, the rest of 1.500 € in 2023.
    expect(assetSchedule({ ...laptop, fullFirstYear: false }, 2023).map((r) => r.depreciationEur)).toEqual([300, 1500])
  })

  it('books the Restbuchwert on disposal', () => {
    // Office furniture 2.600 €, 13 years = 200 € a year; bought 1.1.2022, sold 30.4.2024 for 1.000 €:
    // 2022 200 €, 2023 200 €, 2024 4/12 × 200 € = 66,67 €; Restbuchwert 2.600 − 466,67 = 2.133,33 €.
    const rows = assetSchedule(
      { id: 'desk', acquired: '2022-01-01', netCostEur: 2_600, method: 'linear', usefulLifeYears: 13, disposal: { date: '2024-04-30', proceedsEur: 1000 } },
      2026,
    )
    expect(rows).toHaveLength(3)
    expect(rows[2]).toMatchObject({ depreciationEur: 66.67, closingBookValueEur: 0, disposal: { residualBookValueEur: 2133.33, proceedsEur: 1000 } })
  })
})

describe('degressive AfA (§ 7 Abs. 2 EStG)', () => {
  it('knows the three windows and their caps', () => {
    expect(degressiveRate('2022-05-10', 10)).toMatchObject({ rate: 0.25 })
    expect(degressiveRate('2024-05-01', 8)).toMatchObject({ rate: 0.2 })
    expect(degressiveRate('2025-07-01', 13)?.rate).toBeCloseTo(3 / 13)
    expect(degressiveRate('2025-07-01', 6)).toMatchObject({ rate: 0.3 })
    expect(degressiveRate('2023-03-01', 10)).toBeNull()
    expect(degressiveRate('2024-03-31', 10)).toBeNull()
    expect(degressiveRate('2025-06-30', 10)).toBeNull()
  })

  it('computes inside the 2020–2022 window and switches to linear when that gives more', () => {
    // Machine 12.000 €, 10 years, bought 10.5.2022: 25 %.
    // 2022: 12.000 × 25 % × 8/12 = 2.000 €. 2023: 10.000 × 25 % = 2.500 €. 2024: 7.500 × 25 % = 1.875 €.
    const rows = assetSchedule({ id: 'm', acquired: '2022-05-10', netCostEur: 12_000, method: 'degressive', usefulLifeYears: 10 }, 2032)
    expect(rows.slice(0, 3).map((r) => r.depreciationEur)).toEqual([2000, 2500, 1875])
    // The book value reaches zero at the end of the useful life (May 2032), linear on the rest by then.
    const total = rows.reduce((sum, r) => sum + r.depreciationEur, 0)
    expect(total).toBeCloseTo(12_000, 2)
    expect(rows.at(-1)?.closingBookValueEur).toBe(0)
  })

  it('refuses an acquisition outside every window', () => {
    expect(() => assetSchedule({ id: 'm', acquired: '2023-03-01', netCostEur: 12_000, method: 'degressive', usefulLifeYears: 10 }, 2024)).toThrow(RangeError)
  })
})

describe('buildings (§ 7 Abs. 4 EStG)', () => {
  it('uses 3 % for new residential buildings from 2023, 2 % and 2,5 % for older ones', () => {
    expect(buildingRate('wohnen', '2023-06-01')).toBe(0.03)
    expect(buildingRate('wohnen', '1990-01-01')).toBe(0.02)
    expect(buildingRate('wohnen', '1910-01-01')).toBe(0.025)
    expect(buildingRate('betrieb', '1990-01-01')).toBe(0.03)
    // 300.000 € × 3 % = 9.000 € a year; bought 1.7.2024: 6/12 = 4.500 €.
    const rows = assetSchedule({ id: 'b', acquired: '2024-07-01', netCostEur: 300_000, method: 'building', buildingRate: 0.03 }, 2025)
    expect(rows.map((r) => r.depreciationEur)).toEqual([4500, 9000])
  })
})

describe('Investitionsabzugsbetrag and Sonder-AfA (§ 7g EStG)', () => {
  it('limits the deduction to 50 %, the 200.000 € cap and the 200.000 € profit limit', () => {
    expect(maxInvestmentDeduction({ plannedCostEur: 30_000, profitBeforeIabEur: 60_000, openDeductionsEur: 0 })).toEqual({ maxEur: 15_000, blockedBy: null })
    expect(maxInvestmentDeduction({ plannedCostEur: 30_000, profitBeforeIabEur: 200_001, openDeductionsEur: 0 })).toEqual({ maxEur: 0, blockedBy: 'gewinngrenze' })
    expect(maxInvestmentDeduction({ plannedCostEur: 30_000, profitBeforeIabEur: 60_000, openDeductionsEur: 190_000 })).toEqual({ maxEur: 10_000, blockedBy: 'hoechstbetrag' })
    expect([2017, 2018, 2019, 2020, 2022].map(investmentDeadlineYear)).toEqual([2023, 2023, 2023, 2023, 2025])
  })

  it('runs a case over three years: deduct 2022, invest 2024, reverse the rest after 2025', () => {
    // 2022: planned van 30.000 € → IAB 15.000 €.
    const deduction = { year: 2022, amountEur: 15_000 }
    // 2024: van bought 1.2.2024 for 20.000 € → added back 50 % = 10.000 €; costs cut by 10.000 €.
    const in2024 = settleInvestmentDeduction(deduction, [{ year: 2024, costEur: 20_000 }], 2024)
    expect(in2024).toMatchObject({ additions: [{ year: 2024, amountEur: 10_000 }], maxCostReductionEur: 10_000, reversal: null, openEur: 5_000 })
    // Still open while the deadline (end of 2025) runs; reversed in 2022 once 2026 has begun.
    expect(settleInvestmentDeduction(deduction, [{ year: 2024, costEur: 20_000 }], 2025).reversal).toBeNull()
    expect(settleInvestmentDeduction(deduction, [{ year: 2024, costEur: 20_000 }], 2026).reversal).toEqual({ year: 2022, amountEur: 5_000 })

    // The van (Lkw-AfA: 9 years) on the cut base of 10.000 €: Sonder-AfA 40 % = 4.000 € in 2024.
    // Linear 10.000 / 108 months × 11 = 1.018,52 € in 2024, then 1.111,11 € a year.
    const van = {
      id: 'van',
      acquired: '2024-02-01',
      netCostEur: 20_000,
      method: 'linear' as const,
      usefulLifeYears: 9,
      iabCostReductionEur: 10_000,
      specialDepreciation: [{ year: 2024, amountEur: 4_000 }],
    }
    const rows = assetSchedule(van, 2025)
    expect(rows[0]).toMatchObject({ costReductionEur: 10_000, specialDepreciationEur: 4_000, depreciationEur: 1018.52, closingBookValueEur: 4981.48 })
    expect(rows[1]?.depreciationEur).toBe(1111.11)
    expect(depreciationForYear(2024, [van]).byKey).toEqual({ ausgaben_afa_beweglich: 1018.52, ausgaben_sonder_afa_7g: 4_000, ausgaben_herabsetzung_7g: 10_000 })
  })

  it('caps the Sonder-AfA at 20 % before 2024 and at 40 % after', () => {
    const asset = { id: 'x', acquired: '2023-06-01', netCostEur: 10_000, method: 'linear' as const, usefulLifeYears: 5 }
    expect(() => assetSchedule({ ...asset, specialDepreciation: [{ year: 2023, amountEur: 2_001 }] }, 2023)).toThrow(RangeError)
    expect(() => assetSchedule({ ...asset, specialDepreciation: [{ year: 2028, amountEur: 100 }] }, 2028)).toThrow(RangeError)
    expect(assetSchedule({ ...asset, specialDepreciation: [{ year: 2023, amountEur: 1_000 }, { year: 2024, amountEur: 1_000 }] }, 2024)[1]?.specialDepreciationEur).toBe(1_000)
  })
})
