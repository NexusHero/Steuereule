import { describe, expect, it } from 'vitest'
import { capitalGroup, crossBorderGroup, pensionGroup, rentalGroup, type RentalPropertyYearFacts } from './history-groups'
import type { NGreInput } from './n-gre'

// ADR-0099 §7 — the groups as tabs on „Entwicklung“, each only with data of the household.

const nGre = (grossWageChf: number, withholdingTaxChf: number, rate: number): NGreInput => ({
  grossWageChf,
  familienzulagenChf: 0,
  ahvContributionsChf: 0,
  withholdingTaxChf,
  krankentaggeldChf: 0,
  pkArbeitnehmerChf: 0,
  pkArbeitgeberChf: 0,
  rate,
})

describe('crossBorderGroup', () => {
  it('gives the rate, the wage in euros, the credited Quellensteuer and the Swiss share per year', () => {
    const group = crossBorderGroup([
      { year: 2024, statements: [{ person: 'A', nGre: nGre(8_000, 400, 1.05), period: '2024' }], germanGross: 36_450 },
      { year: 2025, statements: [{ person: 'A', nGre: nGre(49_000, 2_500, 1.065), period: '2025' }], germanGross: 0 },
    ])
    expect(group!.years.map((y) => [y.year, y.rate, y.grossChf, y.grossEur, y.rateChangePercent])).toEqual([
      [2024, 1.05, 8_000, 8_400, null],
      [2025, 1.065, 49_000, 52_185, 1.4],
    ])
    // 4,5 % of the gross wage at most (DBA Art. 15a): 2.500 CHF are more than 2.205 CHF.
    expect(group!.years[1]).toMatchObject({ withholdingTaxChf: 2_500, creditedEur: 2_348, creditCapped: true })
    expect(group!.years[0]).toMatchObject({ creditedEur: 378, creditCapped: true })
    expect(group!.swissShare).toEqual([
      { year: 2024, percent: 18.7 },
      { year: 2025, percent: 100 },
    ])
  })

  it('is absent without a Lohnausweis', () => {
    expect(crossBorderGroup([{ year: 2024, statements: [], germanGross: 50_000 }])).toBeNull()
  })
})

const property = (year: number, extra: Partial<RentalPropertyYearFacts> = {}): RentalPropertyYearFacts => ({
  propertyKey: 'whg-1',
  year,
  label: 'Lindenweg 4',
  income: 9_600,
  umlagen: 1_800,
  werbungskosten: 2_400,
  schuldzinsen: 4_100,
  buildingCost: 210_000,
  baujahr: 1995,
  acquiredOn: '2023-04-01',
  repairs: [],
  ...extra,
})

describe('rentalGroup', () => {
  it('gives the result per object and year with the AfA pro rata in the year of purchase', () => {
    const group = rentalGroup([property(2023, { income: 7_200, umlagen: 1_350 }), property(2024), property(2025)], '2026-11-19')!
    const obj = group.properties[0]!
    expect(obj.depreciation).toEqual({ annual: 4_200, ratePercent: 2 })
    // April to December: 9 of 12 months.
    expect(obj.years.map((y) => [y.year, y.depreciation, y.result, y.bookValueEnd])).toEqual([
      [2023, 3_150, 7_200 + 1_350 - 2_400 - 4_100 - 3_150, 206_850],
      [2024, 4_200, 9_600 + 1_800 - 2_400 - 4_100 - 4_200, 202_650],
      [2025, 4_200, 700, 198_450],
    ])
    expect(obj).toMatchObject({ bookValue: 198_450, yearsLeft: 48 })
  })

  it('checks the 15 % limit in the three years after the purchase with the stored repairs', () => {
    const group = rentalGroup(
      [
        property(2023, { repairs: [{ amount: 8_000, date: '2023-06-10' }] }),
        property(2024, { repairs: [{ amount: 4_300, date: null }] }),
      ],
      '2025-01-15',
    )!
    expect(group.properties[0]!.acquisitionRelated).toEqual({ windowEnd: '2026-04-01', limitEur: 31_500, withinWindowEur: 12_300, exceeds: false, roomLeftEur: 19_200, windowOpen: true, undatedCounted: 1 })
  })

  it('names what is missing instead of computing a result', () => {
    const group = rentalGroup([property(2024, { werbungskosten: null, baujahr: null, acquiredOn: null })], '2026-11-19')!
    expect(group.properties[0]!.years[0]).toMatchObject({ result: null, missing: ['werbungskosten', 'afa'] })
    expect(group.properties[0]!.acquisitionRelated).toBeNull()
  })

  it('is absent without an object', () => {
    expect(rentalGroup([], '2026-11-19')).toBeNull()
  })
})

describe('capitalGroup', () => {
  it('shows the Sparer-Pauschbetrag used against the limit and the Günstigerprüfung where the zvE is known', () => {
    const group = capitalGroup([
      { year: 2024, filingType: 'zusammen', income: 2_682, allowanceUsed: 2_000, zvE: 71_271 },
      { year: 2025, filingType: 'zusammen', income: 1_200, allowanceUsed: null, zvE: null },
    ])!
    expect(group.years.map((y) => [y.year, y.allowanceLimit, y.allowanceUsed, y.aboveAllowance, y.fullyUsed])).toEqual([
      [2024, 2_000, 2_000, 682, true],
      [2025, 2_000, 1_200, 0, false],
    ])
    expect(group.years[0]!.favourableCheck).toMatchObject({ statement: 'eindeutig', recommendation: 'abgeltung' })
    expect(group.years[1]!.favourableCheck).toBeNull()
  })

  it('is absent without capital income', () => {
    expect(capitalGroup([{ year: 2024, filingType: 'einzel', income: null, allowanceUsed: null, zvE: null }])).toBeNull()
  })
})

describe('pensionGroup', () => {
  it('gives the Besteuerungsanteil and the fixed Rentenfreibetrag from the first full year', () => {
    const group = pensionGroup([
      { year: 2023, kind: 'GesetzlicheRente', amount: 9_000, startYear: 2023 },
      { year: 2024, kind: 'GesetzlicheRente', amount: 18_000, startYear: 2023 },
      { year: 2025, kind: 'GesetzlicheRente', amount: 18_600, startYear: 2023 },
    ])!
    expect(group).toMatchObject({ startYear: 2023, sharePercent: 82.5, allowance: 3_150, allowanceYear: 2024 })
    expect(group.years.map((y) => [y.year, y.taxablePart])).toEqual([
      [2023, 7_425],
      [2024, 14_850],
      [2025, 15_450],
    ])
  })

  it('leaves the allowance open while the first full year is not recorded', () => {
    const group = pensionGroup([{ year: 2025, kind: 'GesetzlicheRente', amount: 18_600, startYear: 2023 }])!
    expect(group).toMatchObject({ allowance: null, allowanceYear: 2024 })
    expect(group.years[0]!.taxablePart).toBeNull()
  })

  it('is absent without a pension', () => {
    expect(pensionGroup([])).toBeNull()
  })
})
