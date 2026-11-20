import { describe, expect, it } from 'vitest'
import { batteryDeductionEur, companyCarUse, listPriceFactor } from './company-car'

const PETROL = {
  year: 2025,
  listPriceGrossEur: 45_990,
  acquired: '2023-04-01',
  drive: 'verbrenner',
  businessShareOver50: true,
  monthsInBusiness: 12,
  method: 'pauschal',
  totalCostsEur: 14_000,
} as const

describe('the fraction of the list price (§ 6 Abs. 1 Nr. 4 Satz 2 Nr. 2–5 EStG)', () => {
  it('takes a quarter for an electric car up to the cap of its acquisition date, half above it', () => {
    expect(listPriceFactor({ drive: 'elektro', acquired: '2023-12-31', listPriceGrossEur: 60_000 })).toBe(0.25)
    expect(listPriceFactor({ drive: 'elektro', acquired: '2023-12-31', listPriceGrossEur: 60_001 })).toBe(0.5)
    expect(listPriceFactor({ drive: 'elektro', acquired: '2025-06-30', listPriceGrossEur: 70_000 })).toBe(0.25)
    expect(listPriceFactor({ drive: 'elektro', acquired: '2025-07-01', listPriceGrossEur: 99_000 })).toBe(0.25)
    expect(listPriceFactor({ drive: 'elektro', acquired: '2018-12-31', listPriceGrossEur: 40_000 })).toBe(1)
  })

  it('takes half for a hybrid that meets the CO₂ or range rule of its acquisition date', () => {
    expect(listPriceFactor({ drive: 'hybrid', acquired: '2021-06-01', listPriceGrossEur: 50_000, electricRangeKm: 45 })).toBe(0.5)
    expect(listPriceFactor({ drive: 'hybrid', acquired: '2023-06-01', listPriceGrossEur: 50_000, electricRangeKm: 55 })).toBe(1)
    expect(listPriceFactor({ drive: 'hybrid', acquired: '2023-06-01', listPriceGrossEur: 50_000, co2GPerKm: 40 })).toBe(0.5)
    expect(listPriceFactor({ drive: 'hybrid', acquired: '2025-02-01', listPriceGrossEur: 50_000, electricRangeKm: 79 })).toBe(1)
    expect(listPriceFactor({ drive: 'hybrid', acquired: '2025-02-01', listPriceGrossEur: 50_000, electricRangeKm: 80 })).toBe(0.5)
  })
})

describe('the battery deduction (§ 6 Abs. 1 Nr. 4 Satz 2 Nr. 1 EStG, statute read)', () => {
  it('cuts the list price of a car bought before 2023 that takes no fraction: 500 €/kWh up to 2013, 50 € less a year, capped', () => {
    expect(batteryDeductionEur({ drive: 'elektro', acquired: '2013-05-01', listPriceGrossEur: 40_000, batteryKwh: 16 })).toBe(8_000)
    expect(batteryDeductionEur({ drive: 'elektro', acquired: '2013-05-01', listPriceGrossEur: 40_000, batteryKwh: 30 })).toBe(10_000)
    // 2018: 250 €/kWh, at most 7.500 €.
    expect(batteryDeductionEur({ drive: 'elektro', acquired: '2018-06-01', listPriceGrossEur: 40_000, batteryKwh: 40 })).toBe(7_500)
    // 2022: a hybrid below the range rule, 50 €/kWh, at most 5.500 €.
    expect(batteryDeductionEur({ drive: 'hybrid', acquired: '2022-03-01', listPriceGrossEur: 50_000, batteryKwh: 12, electricRangeKm: 50 })).toBe(600)
  })

  it('takes nothing from a car with a fraction, a combustion car or one bought from 2023', () => {
    expect(batteryDeductionEur({ drive: 'elektro', acquired: '2020-01-01', listPriceGrossEur: 40_000, batteryKwh: 50 })).toBe(0)
    expect(batteryDeductionEur({ drive: 'verbrenner', acquired: '2015-01-01', listPriceGrossEur: 40_000, batteryKwh: 50 })).toBe(0)
    expect(batteryDeductionEur({ drive: 'hybrid', acquired: '2023-03-01', listPriceGrossEur: 50_000, batteryKwh: 12, electricRangeKm: 50 })).toBe(0)
  })

  it('takes the 1 % of the cut list price, rounded down to 100 €, and the VAT of the full one', () => {
    const r = companyCarUse({ ...PETROL, drive: 'elektro', acquired: '2016-02-01', listPriceGrossEur: 36_250, batteryKwh: 24, totalCostsEur: undefined })
    if (r.kind !== 'berechnet') throw new Error(r.kind)
    // 2016: 350 €/kWh × 24 = 8.400 €; 36.250 − 8.400 = 27.850 → 27.800 €.
    expect(r.assessedListPriceEur).toBe(27_800)
    expect(r.privateUseEur).toBe(3_336)
    expect(r.vat!.baseEur + r.vat!.freeOfVatEur).toBe(4_344)
  })
})

describe('private use of a business car (1 %-Regel, Fahrtenbuch, Kostendeckelung)', () => {
  it('1 % of the list price rounded down to 100 € a month, the VAT on 80 % of the full value (Abschn. 15.23 Abs. 5 UStAE)', () => {
    const r = companyCarUse(PETROL)
    if (r.kind !== 'berechnet') throw new Error(r.kind)
    expect(r.assessedListPriceEur).toBe(45_900)
    expect(r.privateUseEur).toBe(5_508)
    expect(r.vat).toEqual({ baseEur: 4_406.4, vatEur: 837.22, freeOfVatEur: 1_101.6 })
    expect(r.capped).toBe(false)
  })

  it('an electric car: a quarter for the income tax, the full list price for the VAT', () => {
    const r = companyCarUse({ ...PETROL, drive: 'elektro', listPriceGrossEur: 52_000 })
    if (r.kind !== 'berechnet') throw new Error(r.kind)
    expect(r.assessedListPriceEur).toBe(13_000)
    expect(r.privateUseEur).toBe(1_560)
    expect(r.vat?.baseEur).toBe(4_992)
  })

  it('home to business: 0,03 % per km and month less the Entfernungspauschale is not deductible (§ 4 Abs. 5 Satz 1 Nr. 6 EStG)', () => {
    const r = companyCarUse({ ...PETROL, commute: { distanceKm: 15, days: 200 } })
    if (r.kind !== 'berechnet') throw new Error(r.kind)
    // 45.900 × 0,03 % × 15 km × 12 = 2.478,60 €; Pauschale 2025: 200 × 15 × 0,30 = 900 €.
    expect(r.commute).toEqual({ valueEur: 2_478.6, allowanceEur: 900, nonDeductibleEur: 1_578.6 })
  })

  it('caps the use and the non-deductible commute at the car’s total costs', () => {
    const r = companyCarUse({ ...PETROL, totalCostsEur: 5_000, commute: { distanceKm: 15, days: 200 } })
    if (r.kind !== 'berechnet') throw new Error(r.kind)
    expect(r.capped).toBe(true)
    expect(r.privateUseEur + r.commute!.nonDeductibleEur).toBe(5_000)
  })

  it('under the Kostendeckelung the VAT base of an electric car stays within the total costs (review)', () => {
    const r = companyCarUse({ ...PETROL, drive: 'elektro', listPriceGrossEur: 52_000, totalCostsEur: 1_000 })
    if (r.kind !== 'berechnet') throw new Error(r.kind)
    expect(r.capped).toBe(true)
    expect(r.vat!.baseEur + r.vat!.freeOfVatEur).toBeLessThanOrEqual(1_000)
  })

  it('compares an electric car with its total costs, the AfA in them at a quarter (BMF 05.11.2021 Rn. 13, read)', () => {
    // 1 % of 13.000 € × 12 = 1.560 €; total costs 5.000 € of which 4.000 € AfA count 5.000 − 4.000 × 3/4 = 2.000 €: no cap.
    const free = companyCarUse({ ...PETROL, drive: 'elektro', listPriceGrossEur: 52_000, totalCostsEur: 5_000, depreciationEur: 4_000 })
    if (free.kind !== 'berechnet') throw new Error(free.kind)
    expect(free.capped).toBe(false)
    expect(free.privateUseEur).toBe(1_560)
    // Total costs 2.000 € of which 1.600 € AfA count 800 €: the cap takes 800 €, not 1.560 €.
    const capped = companyCarUse({ ...PETROL, drive: 'elektro', listPriceGrossEur: 52_000, totalCostsEur: 2_000, depreciationEur: 1_600 })
    if (capped.kind !== 'berechnet') throw new Error(capped.kind)
    expect(capped.capped).toBe(true)
    expect(capped.privateUseEur).toBe(800)
    // The VAT compares the full value with the unreduced costs: 2.000 €.
    expect(capped.vat!.baseEur + capped.vat!.freeOfVatEur).toBe(2_000)
  })

  it('by logbook counts the leasing of an electric car at its fraction too (Satz 3 Nr. 2–5)', () => {
    const r = companyCarUse({ ...PETROL, drive: 'elektro', listPriceGrossEur: 52_000, method: 'fahrtenbuch', totalCostsEur: 10_000, leasingEur: 8_000, privateShare: 0.25 })
    if (r.kind !== 'berechnet') throw new Error(r.kind)
    // 10.000 − 8.000 × 3/4 = 4.000 € × 25 %.
    expect(r.privateUseEur).toBe(1_000)
  })

  it('refuses the 1 % rule at business use of 50 % or less: a logbook or an estimate is needed', () => {
    expect(companyCarUse({ ...PETROL, businessShareOver50: false })).toEqual({ kind: 'nicht_zulaessig', reason: 'betriebliche_nutzung_bis_50' })
  })

  it('by logbook: the private share of the costs, the AfA of an electric car at a quarter', () => {
    const r = companyCarUse({ ...PETROL, drive: 'elektro', listPriceGrossEur: 52_000, method: 'fahrtenbuch', totalCostsEur: 12_000, depreciationEur: 8_000, privateShare: 0.2, costsWithInputVatEur: 3_000 })
    if (r.kind !== 'berechnet') throw new Error(r.kind)
    // 12.000 − 8.000 × 3/4 = 6.000 € × 20 %.
    expect(r.privateUseEur).toBe(1_200)
    expect(r.vat?.baseEur).toBe(600)
  })

  it('by logbook the trips home–business cost their share of the kilometres', () => {
    const r = companyCarUse({ ...PETROL, method: 'fahrtenbuch', totalCostsEur: 10_000, privateShare: 0.1, totalKm: 20_000, commute: { distanceKm: 10, days: 100 } })
    if (r.kind !== 'berechnet') throw new Error(r.kind)
    // 0,50 €/km × 2.000 km = 1.000 €; Pauschale 100 × 10 × 0,30 = 300 €.
    expect(r.commute).toEqual({ valueEur: 1_000, allowanceEur: 300, nonDeductibleEur: 700 })
  })

  it('pro rata for the months the car was in the business', () => {
    const r = companyCarUse({ ...PETROL, monthsInBusiness: 4 })
    if (r.kind !== 'berechnet') throw new Error(r.kind)
    expect(r.privateUseEur).toBe(1_836)
  })
})
