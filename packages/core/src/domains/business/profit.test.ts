import { describe, expect, it } from 'vitest'
import { commuteAllowance, euerProfit, giftLimitEur, homeOfficeDeduction } from './profit'

describe('restricted expenses per year (§ 4 Abs. 5 EStG)', () => {
  it('raises the gift limit from 35 € to 50 € in 2024', () => {
    expect(giftLimitEur(2023)).toBe(35)
    expect(giftLimitEur(2024)).toBe(50)
  })

  it('knows the home office rules before and after the 2023 reform', () => {
    // 2022: 5 € × 120 days at most = 600 €. 2023: 6 € × 210 days = 1.260 €.
    expect(homeOfficeDeduction(2022, { kind: 'tagespauschale', days: 200 })).toBe(600)
    expect(homeOfficeDeduction(2023, { kind: 'tagespauschale', days: 250 })).toBe(1260)
    expect(homeOfficeDeduction(2024, { kind: 'tagespauschale', days: 100 })).toBe(600)
    expect(homeOfficeDeduction(2022, { kind: 'kein_anderer_arbeitsplatz', costsEur: 2_000 })).toBe(1250)
    expect(() => homeOfficeDeduction(2023, { kind: 'kein_anderer_arbeitsplatz', costsEur: 2_000 })).toThrow(RangeError)
    // Jahrespauschale for 9 months met: 1.260 × 9/12 = 945 €.
    expect(homeOfficeDeduction(2025, { kind: 'mittelpunkt', costsEur: 3_000, lumpSum: true, monthsMet: 9 })).toBe(945)
    expect(homeOfficeDeduction(2022, { kind: 'mittelpunkt', costsEur: 3_000, lumpSum: true })).toBe(3000)
  })

  it('uses 0,30/0,38 € until 2025 and 0,38 € from the first km in 2026', () => {
    // 30 km: 20 × 0,30 + 10 × 0,38 = 9,80 € a day × 200 = 1.960 €; 2026: 30 × 0,38 × 200 = 2.280 €.
    expect(commuteAllowance(2025, 30, 200)).toBe(1960)
    expect(commuteAllowance(2026, 30, 200)).toBe(2280)
  })
})

describe('EÜR profit (§ 4 Abs. 3 EStG)', () => {
  it('computes a profit with every restricted key and the IAB lines (2024)', () => {
    const result = euerProfit(
      2024,
      {
        einnahmen_umsatzsteuerpflichtig: 90_000,
        einnahmen_umsatzsteuer_vereinnahmt: 17_100,
        ausgaben_fremdleistungen: 10_000,
        ausgaben_afa_beweglich: 2_000,
        ausgaben_vorsteuer_gezahlt: 1_900,
        ausgaben_umsatzsteuer_an_finanzamt: 14_000,
        beschraenkt_geschenke: 140,
        beschraenkt_bewirtung: 1_000,
        beschraenkt_verpflegungsmehraufwand: 600,
        beschraenkt_fahrten_wohnung_betrieb: 3_000,
        gewinn_iab_abzug: 5_000,
        gewinn_iab_hinzurechnung: 1_000,
      },
      {
        // 40 € and 45 € are within 50 €, 55 € is not: 85 € deductible.
        giftsPerRecipientEur: [40, 45, 55],
        // 10 × 14 € + 3 × 28 € = 224 €, whatever the meals cost.
        mealAllowanceDays: { partialDays: 10, fullDays: 3 },
        // Car in business assets: 25 km × (20 × 0,30 + 5 × 0,38 = 7,90 €) × 180 days = 1.422 € of the 3.000 € booked.
        commute: { distanceKm: 25, days: 180, carInBusinessAssets: true },
      },
    )
    // Income 107.100 €. Expenses 27.900 € + 85 + 700 + 224 + 1.422 = 30.331 €. Before IAB 76.769 €; − 5.000 + 1.000 = 72.769 €.
    expect(result).toMatchObject({ incomeEur: 107_100, expensesEur: 30_331, profitBeforeIabEur: 76_769, profitEur: 72_769, openPoints: [] })
    // Not deductible: 55 € gift, 300 € entertainment, 376 € meals, 1.578 € commute = 2.309 €.
    expect(result.nonDeductibleEur).toBe(2_309)
    expect(result.lines.find((l) => l.key === 'beschraenkt_bewirtung')).toEqual({ key: 'beschraenkt_bewirtung', amountEur: 1_000, countedEur: 700, effectEur: -700 })
  })

  it('counts the same gift at 35 € in 2023 and flags totals without detail', () => {
    // 2023: only 30 € counts of 30 + 45.
    expect(euerProfit(2023, { einnahmen_umsatzsteuerfrei: 1_000, beschraenkt_geschenke: 75 }, { giftsPerRecipientEur: [30, 45] }).profitEur).toBe(970)
    expect(euerProfit(2023, { einnahmen_umsatzsteuerfrei: 1_000, beschraenkt_geschenke: 75 }).openPoints).toEqual(['geschenke_ohne_empfaenger'])
  })

  it('deducts the Tagespauschale and the Entfernungspauschale without a booking, and allows a loss', () => {
    const result = euerProfit(2026, { einnahmen_kleinunternehmer: 2_000, ausgaben_sonstige: 2_500 }, { homeOffice: { kind: 'tagespauschale', days: 50 }, commute: { distanceKm: 10, days: 20, carInBusinessAssets: false } })
    // 2.000 − 2.500 − 50 × 6 € − 10 × 0,38 × 20 = 2.000 − 2.500 − 300 − 76 = −876 €.
    expect(result.profitEur).toBe(-876)
  })

  it('adds the Gewerbesteuer back and deducts AfA on intangibles and leasing in full', () => {
    // 50.000 − 1.000 (AfA immateriell) − 2.400 (Leasing) = 46.600 €; the 3.000 € Gewerbesteuer booked counts 0.
    const result = euerProfit(2025, { einnahmen_umsatzsteuerpflichtig: 50_000, ausgaben_afa_immateriell: 1_000, ausgaben_miete_leasing_beweglich: 2_400, ausgaben_gewerbesteuer: 3_000 })
    expect(result).toMatchObject({ expensesEur: 3_400, profitEur: 46_600, nonDeductibleEur: 3_000 })
    expect(result.lines.find((l) => l.key === 'ausgaben_gewerbesteuer')).toEqual({ key: 'ausgaben_gewerbesteuer', amountEur: 3_000, countedEur: 0, effectEur: 0 })
  })

  it('lists the non-deductible keys at 0 and counts the VAT on Entnahmen as income', () => {
    // 50.000 + 380 (USt auf Entnahmen) − 1.200 (Schuldzinsen, abziehbarer Teil) = 49.180 €;
    // 300 € Schuldzinsen nach § 4 Abs. 4a and 150 € Bußgeld are listed but count 0.
    const result = euerProfit(2024, {
      einnahmen_umsatzsteuerpflichtig: 50_000,
      einnahmen_umsatzsteuer_entnahmen: 380,
      ausgaben_schuldzinsen: 1_200,
      nicht_abziehbar_schuldzinsen_4_4a: 300,
      nicht_abziehbar_sonstige: 150,
    })
    expect(result).toMatchObject({ incomeEur: 50_380, expensesEur: 1_200, profitEur: 49_180, nonDeductibleEur: 450 })
    expect(result.lines.find((l) => l.key === 'nicht_abziehbar_sonstige')).toEqual({ key: 'nicht_abziehbar_sonstige', amountEur: 150, countedEur: 0, effectEur: 0 })
  })

  it('refuses negative amounts', () => {
    expect(() => euerProfit(2024, { ausgaben_sonstige: -1 })).toThrow(RangeError)
  })
})
