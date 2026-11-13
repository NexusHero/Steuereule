import { describe, expect, it } from 'vitest'
import { computeGiftTax, giftTaxClass, giftTaxOn } from './gift-tax'

describe('gift and inheritance tax (ErbStG)', () => {
  it('sorts the relation into its class, parents by whether it is a gift or an inheritance', () => {
    expect(giftTaxClass('child', false)).toBe('I')
    expect(giftTaxClass('parent', true)).toBe('I')
    expect(giftTaxClass('parent', false)).toBe('II')
    expect(giftTaxClass('niece_nephew', false)).toBe('II')
    expect(giftTaxClass('other', true)).toBe('III')
  })

  it('applies the rate of the bracket the acquisition falls in', () => {
    // Child, gift of 500.000 €: 100.000 € taxable at 11 %.
    expect(computeGiftTax({ relation: 'child', onDeath: false, valueEur: 500_000 })).toMatchObject({ taxClass: 'I', personalAllowanceEur: 400_000, taxableEur: 100_000, ratePercent: 11, taxEur: 11_000 })
    // Unmarried partner, 50.000 €: 30.000 € at 30 %.
    expect(computeGiftTax({ relation: 'other', onDeath: false, valueEur: 50_000 }).taxEur).toBe(9_000)
  })

  it('caps the step at a bracket limit (§ 19 Abs. 3)', () => {
    // 76.000 € in class I: 11 % would be 8.360 €; 75.000 × 7 % + half of 1.000 € = 5.750 €.
    expect(giftTaxOn(76_000, 'I')).toEqual({ taxEur: 5_750, ratePercent: 11 })
    // 6.100.000 € in class III: 50 % would be 3.050.000 €; 1.800.000 € + three quarters of 100.000 €.
    expect(giftTaxOn(6_100_000, 'III')).toEqual({ taxEur: 1_875_000, ratePercent: 50 })
  })

  it('adds the maintenance allowance on death and rounds the taxable amount down to 100 €', () => {
    // Spouse inherits 1.000.050 €: minus 500.000 € and 256.000 € = 244.050 € → 244.000 € at 11 %.
    expect(computeGiftTax({ relation: 'spouse', onDeath: true, valueEur: 1_000_050 })).toMatchObject({ maintenanceAllowanceEur: 256_000, taxableEur: 244_000, taxEur: 26_840 })
    expect(computeGiftTax({ relation: 'child', onDeath: true, valueEur: 400_000, childAge: 12 }).maintenanceAllowanceEur).toBe(30_700)
    expect(computeGiftTax({ relation: 'child', onDeath: false, valueEur: 400_000, childAge: 12 }).maintenanceAllowanceEur).toBe(0)
  })

  it('adds up the gifts of ten years under one allowance (§ 14)', () => {
    // 300.000 € earlier and 300.000 € now: 200.000 € over the allowance at 11 %, nothing was due before.
    expect(computeGiftTax({ relation: 'child', onDeath: false, valueEur: 300_000, priorGiftsEur: 300_000 })).toMatchObject({ taxableEur: 200_000, totalTaxEur: 22_000, priorTaxEur: 0, taxEur: 22_000 })
    // 500.000 € earlier (11.000 € due then) and 100.000 € now: 200.000 € → 22.000 €, less 11.000 €.
    expect(computeGiftTax({ relation: 'child', onDeath: false, valueEur: 100_000, priorGiftsEur: 500_000 }).taxEur).toBe(11_000)
  })
})
