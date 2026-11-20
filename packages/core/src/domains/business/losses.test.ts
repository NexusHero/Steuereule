import { describe, expect, it } from 'vitest'
import { applyLosses, carryBackLoss, lossRules } from './losses'

describe('§ 10d EStG rules per year', () => {
  it('uses 10 Mio. € back for 2022–2023, 1 Mio. € from 2024, and 70 % forward for 2024–2027', () => {
    expect(lossRules(2022, false)).toEqual({ carryBackCapEur: 10_000_000, carryBackYears: 2, forwardBaseEur: 1_000_000, forwardRate: 0.6 })
    expect(lossRules(2023, true)).toMatchObject({ carryBackCapEur: 20_000_000, forwardBaseEur: 2_000_000, forwardRate: 0.6 })
    expect(lossRules(2024, false)).toMatchObject({ carryBackCapEur: 1_000_000, forwardRate: 0.7 })
    expect(lossRules(2026, true)).toMatchObject({ carryBackCapEur: 2_000_000, forwardRate: 0.7 })
  })
})

describe('a loss year with Rücktrag and Vortrag', () => {
  it('goes back into the year before first, then the second year before, the rest forward', () => {
    // Loss 2025: 50.000 €. 2024 offers 30.000 €, 2023 offers 12.000 € → 8.000 € go forward.
    const back = carryBackLoss({ lossYear: 2025, lossEur: 50_000, joint: false, roomEur: [30_000, 12_000], waive: false })
    expect(back).toEqual({ intoYearBeforeEur: 30_000, intoSecondYearBeforeEur: 12_000, remainingEur: 8_000 })
    // The Feststellung at the end of 2025 with 3.000 € carried from before: 3.000 + 8.000 = 11.000 €.
    expect(applyLosses({ year: 2025, joint: false, gdeEur: -50_000, carriedForwardEur: 3_000, carriedBackOfThisLossEur: 42_000 })).toEqual({
      carryBackDeductedEur: 0,
      carryForwardDeductedEur: 0,
      gdeAfterLossesEur: 0,
      newLossEur: 50_000,
      remainingCarryForwardEur: 11_000,
    })
    // 2026: GdE 40.000 € takes the 11.000 € in full (below the Sockelbetrag).
    expect(applyLosses({ year: 2026, joint: false, gdeEur: 40_000, carriedForwardEur: 11_000 })).toMatchObject({ carryForwardDeductedEur: 11_000, gdeAfterLossesEur: 29_000, remainingCarryForwardEur: 0 })
  })

  it('carries everything forward when the user waives the Rücktrag', () => {
    expect(carryBackLoss({ lossYear: 2023, lossEur: 20_000, joint: true, roomEur: [100_000, 100_000], waive: true }).remainingEur).toBe(20_000)
  })

  it('applies the Mindestbesteuerung above the Sockelbetrag', () => {
    // 2024: GdE 3 Mio. €, Vortrag 5 Mio. €: 1 Mio. € + 70 % × 2 Mio. € = 2,4 Mio. € deductible.
    expect(applyLosses({ year: 2024, joint: false, gdeEur: 3_000_000, carriedForwardEur: 5_000_000 })).toMatchObject({ carryForwardDeductedEur: 2_400_000, gdeAfterLossesEur: 600_000, remainingCarryForwardEur: 2_600_000 })
    // 2023: 60 % → 1 Mio. € + 1,2 Mio. € = 2,2 Mio. €.
    expect(applyLosses({ year: 2023, joint: false, gdeEur: 3_000_000, carriedForwardEur: 5_000_000 }).carryForwardDeductedEur).toBe(2_200_000)
  })

  it('takes a carry-back from a later year before the Vortrag', () => {
    expect(applyLosses({ year: 2024, joint: false, gdeEur: 30_000, carriedForwardEur: 10_000, carriedBackEur: 25_000 })).toMatchObject({ carryBackDeductedEur: 25_000, carryForwardDeductedEur: 5_000, gdeAfterLossesEur: 0, remainingCarryForwardEur: 5_000 })
  })
})
