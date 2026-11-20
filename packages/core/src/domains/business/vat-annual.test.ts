import { describe, expect, it } from 'vitest'
import { cashAccountingAllowed, gasSupplyRate, restaurantFoodRate, vatAnnualReturn } from './vat-annual'

describe('VAT rates per year (§ 12, § 28 UStG)', () => {
  it('taxes restaurant food at 7 % until 2023 and from 2026, at 19 % in 2024 and 2025', () => {
    expect(restaurantFoodRate('2022-06-01')).toBe('reduced')
    expect(restaurantFoodRate('2023-12-31')).toBe('reduced')
    expect(restaurantFoodRate('2024-01-01')).toBe('standard')
    expect(restaurantFoodRate('2025-12-31')).toBe('standard')
    expect(restaurantFoodRate('2026-01-01')).toBe('reduced')
  })

  it('taxes gas at 7 % from October 2022 to March 2024', () => {
    expect(gasSupplyRate('2022-09-30')).toBe('standard')
    expect(gasSupplyRate('2022-10-01')).toBe('reduced')
    expect(gasSupplyRate('2024-04-01')).toBe('standard')
  })

  it('allows Istversteuerung up to 600.000 € before 2024, 800.000 € from 2024, always for a freelancer', () => {
    expect(cashAccountingAllowed(2023, 700_000, false)).toBe(false)
    expect(cashAccountingAllowed(2024, 700_000, false)).toBe(true)
    // Nr. 2: freed from keeping books under § 148 AO, whatever the turnover (statute read).
    expect(cashAccountingAllowed(2025, 2_000_000, false, true)).toBe(true)
    expect(cashAccountingAllowed(2025, 2_000_000, true)).toBe(true)
  })
})

describe('annual VAT return (§ 18 Abs. 3 UStG)', () => {
  it('nets output tax, § 13b tax and input tax against the prepayments', () => {
    // 80.000 € × 19 % = 15.200 €; 5.000 € × 7 % = 350 €; § 13b: 2.000 € × 19 % = 380 € owed and deducted.
    // Input tax 3.100 € + 380 € = 3.480 €. Year: 15.200 + 350 + 380 − 3.480 = 12.450 €; prepaid 12.000 € → 450 € due.
    const result = vatAnnualReturn({
      year: 2024,
      method: 'soll',
      regime: 'regel',
      taxableNetEur: { standard: 80_000, reduced: 5_000 },
      reverseChargeNetEur: { standard: 2_000 },
      inputVatEur: 3_100,
      prepaymentsEur: 12_000,
    })
    expect(result).toEqual({
      outputVat: { standard: 15_200, reduced: 350, zero: 0 },
      reverseChargeVatEur: 380,
      inputVatDeductibleEur: 3_480,
      vatOfYearEur: 12_450,
      prepaymentsEur: 12_000,
      balanceEur: 450,
    })
  })

  it('gives a refund when the prepayments were higher', () => {
    const result = vatAnnualReturn({ year: 2022, method: 'ist', regime: 'regel', taxableNetEur: { standard: 10_000.5 }, inputVatEur: 500, prepaymentsEur: 2_000 })
    // 10.000,50 × 19 % = 1.900,10 €; − 500 € = 1.400,10 €; − 2.000 € = −599,90 € (Erstattung).
    expect(result.balanceEur).toBe(-599.9)
  })

  it('lets a Kleinunternehmer owe only the § 13b tax, without deduction', () => {
    const result = vatAnnualReturn({ year: 2025, method: 'ist', regime: 'klein', taxableNetEur: { standard: 20_000 }, reverseChargeNetEur: { standard: 1_000 }, inputVatEur: 400, prepaymentsEur: 0 })
    expect(result).toMatchObject({ outputVat: { standard: 0, reduced: 0, zero: 0 }, reverseChargeVatEur: 190, inputVatDeductibleEur: 0, balanceEur: 190 })
  })
})
