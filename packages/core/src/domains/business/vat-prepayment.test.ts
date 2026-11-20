import { describe, expect, it } from 'vitest'
import { ecSalesListPeriod, specialPrepayment, vatFilingPeriod, vatPeriodReturn, vatPeriodsOf } from './vat-prepayment'

describe('the Voranmeldungszeitraum (§ 18 Abs. 2, 2a UStG)', () => {
  it('is monthly above 7.500 € of last year’s VAT until 2024, above 9.000 € from 2025; no Voranmeldung up to 1.000 € / 2.000 €', () => {
    expect(vatFilingPeriod({ year: 2024, priorYearVatEur: 7_501 })).toEqual({ period: 'monat', reason: 'vorjahressteuer' })
    expect(vatFilingPeriod({ year: 2024, priorYearVatEur: 7_500 })).toEqual({ period: 'quartal', reason: 'vorjahressteuer' })
    expect(vatFilingPeriod({ year: 2025, priorYearVatEur: 8_500 })).toEqual({ period: 'quartal', reason: 'vorjahressteuer' })
    expect(vatFilingPeriod({ year: 2025, priorYearVatEur: 9_001 })).toEqual({ period: 'monat', reason: 'vorjahressteuer' })
    expect(vatFilingPeriod({ year: 2025, priorYearVatEur: 2_000 })).toEqual({ period: 'befreit', reason: 'vorjahressteuer' })
    expect(vatFilingPeriod({ year: 2023, priorYearVatEur: 1_500 })).toEqual({ period: 'quartal', reason: 'vorjahressteuer' })
  })

  it('lets a business with a refund above the limit choose the month (Abs. 2a)', () => {
    expect(vatFilingPeriod({ year: 2025, priorYearVatEur: -9_500, chooseMonthly: true })).toEqual({ period: 'monat', reason: 'wahl_ueberschuss' })
  })

  it('for a founder 2021–2026: the expected VAT of the year, last year annualised (Abs. 2 Satz 6)', () => {
    expect(vatFilingPeriod({ year: 2025, founding: { expectedVatEur: 12_000 } })).toEqual({ period: 'monat', reason: 'gruendung_schaetzung' })
    // Satz 3 frees a small tax owed, not an expected refund (statute read).
    expect(vatFilingPeriod({ year: 2025, founding: { expectedVatEur: -1_500 } })).toEqual({ period: 'quartal', reason: 'gruendung_schaetzung' })
    // 3.000 € in three months of the year before are 12.000 € a year.
    expect(vatFilingPeriod({ year: 2026, priorYearVatEur: 3_000, priorYearMonthsActive: 3 })).toEqual({ period: 'monat', reason: 'vorjahressteuer' })
  })
})

describe('the periods and their due dates (§ 18 Abs. 1 UStG, § 46 UStDV)', () => {
  it('quarters are due on the 10th after them, a month later with the Dauerfristverlängerung', () => {
    const q = vatPeriodsOf(2025, 'quartal', false)
    expect(q.map((p) => [p.from, p.to, p.due])).toEqual([
      ['2025-01-01', '2025-03-31', '2025-04-10'],
      ['2025-04-01', '2025-06-30', '2025-07-10'],
      ['2025-07-01', '2025-09-30', '2025-10-10'],
      ['2025-10-01', '2025-12-31', '2026-01-10'],
    ])
    expect(vatPeriodsOf(2025, 'monat', true)[11]).toMatchObject({ from: '2025-12-01', to: '2025-12-31', due: '2026-02-10', label: '12/2025' })
    expect(vatPeriodsOf(2025, 'befreit', false)).toEqual([])
  })
})

describe('the Sondervorauszahlung (§ 47 UStDV)', () => {
  it('is 1/11 of last year’s prepayments, a part year annualised with begun months as full', () => {
    expect(specialPrepayment({ priorYearPrepaymentsEur: 44_000 })).toBe(4_000)
    expect(specialPrepayment({ priorYearPrepaymentsEur: 11_000, priorYearMonthsActive: 6 })).toBe(2_000)
  })
})

describe('one Voranmeldung (USt 1 A)', () => {
  const figures = {
    taxableNetEur: { standard: 10_000, reduced: 1_000 },
    intraEuAcquisitionNetEur: { standard: 2_000, reduced: 0 },
    reverseChargeEuServicesNetEur: 500,
    reverseChargeOtherNetEur: 0,
    taxFreeWithDeductionEur: 3_000,
    taxFreeWithoutDeductionEur: 0,
    euServicesNetEur: 800,
    inputVatEur: 900,
  }

  it('fills the Kennzahlen and the remaining prepayment (Kz 83)', () => {
    const r = vatPeriodReturn({ figures, regime: 'regel' })
    expect(r.kennzahlen).toMatchObject({ '81': 10_000, '86': 1_000, '41': 3_000, '21': 800, '89': 2_000, '46': 500, '47': 95, '66': 900, '61': 380, '67': 95 })
    // 1.900 + 70 + 380 + 95 − 900 − 380 − 95.
    expect(r.vatDueEur).toBe(1_070)
    expect(r.kennzahlen['83']).toBe(1_070)
  })

  it('declares the bases in whole euros and the tax on them (review)', () => {
    const r = vatPeriodReturn({ figures: { ...figures, taxableNetEur: { standard: 1_000.99, reduced: 0 }, intraEuAcquisitionNetEur: { standard: 0, reduced: 0 }, reverseChargeEuServicesNetEur: 0, taxFreeWithDeductionEur: 0, euServicesNetEur: 0, inputVatEur: 0 }, regime: 'regel' })
    expect(r.kennzahlen['81']).toBe(1_000)
    expect(r.vatDueEur).toBe(190)
  })

  it('lists 0 % photovoltaic supplies in Kz 87 from 2023, not in the 2022 form (verified)', () => {
    const pv = { ...figures, taxableNetEur: { standard: 0, reduced: 0, zero: 5_000 } }
    expect(vatPeriodReturn({ figures: pv, regime: 'regel', year: 2023 }).kennzahlen['87']).toBe(5_000)
    expect(vatPeriodReturn({ figures: pv, regime: 'regel', year: 2022 }).kennzahlen['87']).toBeUndefined()
  })

  it('takes the Sondervorauszahlung off in the last period (Kz 39)', () => {
    const r = vatPeriodReturn({ figures, regime: 'regel', specialPrepaymentDeductionEur: 400 })
    expect(r.kennzahlen['39']).toBe(400)
    expect(r.vatDueEur).toBe(670)
  })

  it('a Kleinunternehmer owes only the § 13b and acquisition tax, without deduction', () => {
    const r = vatPeriodReturn({ figures, regime: 'klein' })
    expect(r.kennzahlen['81']).toBeUndefined()
    expect(r.vatDueEur).toBe(475)
  })
})

describe('the Zusammenfassende Meldung (§ 18a UStG)', () => {
  it('is monthly once intra-EU supplies of goods passed 50.000 € in the quarter or one of the four before', () => {
    expect(ecSalesListPeriod({ goodsByQuarterEur: [10_000, 20_000, 0, 0, 0] })).toBe('quartal')
    expect(ecSalesListPeriod({ goodsByQuarterEur: [10_000, 60_000, 0, 0, 0] })).toBe('monat')
    expect(ecSalesListPeriod({ goodsByQuarterEur: [0, 0, 0, 0, 0] })).toBe('quartal')
  })
})
