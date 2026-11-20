import { describe, expect, it } from 'vitest'
import { incomeTax } from '../../math/tarif'
import { disposalGain, retainedProfitTax, withSpecialTariffs } from './special-tariffs'

const T = (z: number) => incomeTax(z, 2025)

describe('Betriebsveräußerung und -aufgabe (§ 16 EStG)', () => {
  it('gain is price less costs less the capital account; the 45.000 € allowance shrinks above 136.000 € (Abs. 4)', () => {
    expect(disposalGain({ priceEur: 200_000, costsEur: 5_000, capitalAccountEur: 95_000, allowance: true })).toEqual({ gainEur: 100_000, allowanceEur: 45_000, taxableGainEur: 55_000 })
    expect(disposalGain({ priceEur: 250_000, costsEur: 0, capitalAccountEur: 100_000, allowance: true })).toEqual({ gainEur: 150_000, allowanceEur: 31_000, taxableGainEur: 119_000 })
    expect(disposalGain({ priceEur: 300_000, costsEur: 0, capitalAccountEur: 100_000, allowance: true }).allowanceEur).toBe(0)
    expect(disposalGain({ priceEur: 30_000, costsEur: 0, capitalAccountEur: 10_000, allowance: true })).toEqual({ gainEur: 20_000, allowanceEur: 20_000, taxableGainEur: 0 })
    expect(disposalGain({ priceEur: 200_000, costsEur: 0, capitalAccountEur: 100_000, allowance: false }).allowanceEur).toBe(0)
  })
})

describe('§ 34 EStG on the gain', () => {
  it('Fünftelregelung: five times the tax on a fifth (Abs. 1)', () => {
    const tax = withSpecialTariffs(T, { extraordinary: { gainEur: 50_000, method: 'fuenftel' } })
    expect(tax(80_000)).toBe(T(30_000) + 5 * (T(40_000) - T(30_000)))
    expect(tax(80_000)).toBeLessThan(T(80_000))
  })

  it('Fünftelregelung with a negative rest of the income: five times the tax on a fifth of the whole', () => {
    const tax = withSpecialTariffs(T, { extraordinary: { gainEur: 60_000, method: 'fuenftel' } })
    expect(tax(50_000)).toBe(5 * T(10_000))
  })

  it('ermäßigter Steuersatz: 56 % of the average rate on the gain, at least 14 % (Abs. 3)', () => {
    const tax = withSpecialTariffs(T, { extraordinary: { gainEur: 100_000, method: 'ermaessigt' } })
    const rate = Math.max(0.14, (0.56 * T(150_000)) / 150_000)
    expect(tax(150_000)).toBe(Math.floor(T(50_000) + 100_000 * rate))
    const small = withSpecialTariffs(T, { extraordinary: { gainEur: 20_000, method: 'ermaessigt' } })
    // A low income: the 14 % floor holds.
    expect(small(25_000)).toBe(Math.floor(T(5_000) + 20_000 * 0.14))
  })
})

describe('two § 16 gains: the reduced rate for one, the Fünftelregelung for the other (§ 34 Abs. 3 Satz 4)', () => {
  it('taxes the second gain by fifths beside the reduced one', () => {
    const both = withSpecialTariffs(T, { extraordinary: { gainEur: 100_000, method: 'ermaessigt', fifthGainEur: 40_000 } })
    const rate = Math.max(0.14, (0.56 * T(190_000)) / 190_000)
    expect(both(190_000)).toBe(Math.floor(T(50_000) + 5 * (T(58_000) - T(50_000)) + 100_000 * rate))
  })
})

describe('Thesaurierung (§ 34a EStG)', () => {
  it('the retained profit at 28,25 % instead of the tariff, the rest by the tariff (Abs. 1)', () => {
    const r = retainedProfitTax({ year: 2025, profitEur: 300_000, withdrawalsEur: 100_000, depositsEur: 0, tradeTaxEur: 20_000, requestedEur: 150_000, carriedForwardEur: 0 })
    // Nicht entnommen: 300.000 − 100.000 + 20.000 = 220.000; requested 150.000.
    expect(r).toMatchObject({ nonWithdrawnEur: 220_000, favouredEur: 150_000, rate: 0.2825, taxEur: 42_375, recaptureEur: 0 })
    // Next year's nachversteuerungspflichtiger Betrag: 150.000 − 42.375 − Soli 2.330,62.
    expect(r.nextCarriedForwardEur).toBe(105_294.38)
    const tax = withSpecialTariffs(T, { retained: r })
    expect(tax(400_000)).toBe(Math.floor(T(250_000) + 42_375))
  })

  it('withdrawals above the profit recapture 25 % of the excess, up to the amount carried (Abs. 4)', () => {
    const r = retainedProfitTax({ year: 2025, profitEur: 50_000, withdrawalsEur: 90_000, depositsEur: 0, tradeTaxEur: 0, requestedEur: 0, carriedForwardEur: 30_000 })
    expect(r).toMatchObject({ favouredEur: 0, recaptureBaseEur: 30_000, recaptureEur: 7_500, nextCarriedForwardEur: 0 })
  })

  it('adds the Gewerbesteuer back only from VZ 2024; before, the profit after it is what is not withdrawn (verified)', () => {
    const base = { profitEur: 300_000, withdrawalsEur: 100_000, depositsEur: 0, tradeTaxEur: 20_000, requestedEur: 1_000_000, carriedForwardEur: 0 }
    expect(retainedProfitTax({ ...base, year: 2023 }).nonWithdrawnEur).toBe(200_000)
    expect(retainedProfitTax({ ...base, year: 2024 }).nonWithdrawnEur).toBe(220_000)
  })

  it('the rate falls from 2028 (27 %, 26 % from 2030, 25 % from 2032)', () => {
    expect(retainedProfitTax({ year: 2028, profitEur: 1, withdrawalsEur: 0, depositsEur: 0, tradeTaxEur: 0, requestedEur: 1, carriedForwardEur: 0 }).rate).toBe(0.27)
  })
})
