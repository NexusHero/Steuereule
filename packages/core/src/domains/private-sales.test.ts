import { describe, expect, it } from 'vitest'
import { checkPrivateSale, privateSalesExemptionLimit, privateSalesWithinLimit } from './private-sales'

describe('private sales (§ 23 EStG)', () => {
  it('frees crypto and gold after more than one year, counted to the day', () => {
    expect(checkPrivateSale({ kind: 'crypto', acquiredOn: '2024-03-15', soldOn: '2025-03-15' })).toMatchObject({ taxFreeFrom: '2025-03-16', taxable: true })
    expect(checkPrivateSale({ kind: 'crypto', acquiredOn: '2024-03-15', soldOn: '2025-03-16' })).toMatchObject({ taxable: false })
    expect(checkPrivateSale({ kind: 'gold', acquiredOn: '2024-02-29', soldOn: '2025-02-28' })).toMatchObject({ taxFreeFrom: '2025-03-01', taxable: true })
  })

  it('frees property after ten years, or earlier when it was the own home', () => {
    expect(checkPrivateSale({ kind: 'property', acquiredOn: '2016-05-01', soldOn: '2026-05-01' })).toMatchObject({ taxFreeFrom: '2026-05-02', taxable: true })
    expect(checkPrivateSale({ kind: 'property', acquiredOn: '2020-05-01', soldOn: '2026-05-01', ownUseYearOfSaleAndTwoBefore: true })).toMatchObject({ withinPeriod: true, ownUseExempt: true, taxable: false })
    expect(checkPrivateSale({ kind: 'crypto', acquiredOn: '2026-01-01', soldOn: '2026-05-01', ownUseThroughout: true })).toMatchObject({ taxable: true })
  })

  it('treats the limit as all or nothing, 600 € up to 2023 and 1.000 € from 2024', () => {
    expect(privateSalesExemptionLimit(2023)).toBe(600)
    expect(privateSalesExemptionLimit(2024)).toBe(1000)
    expect(privateSalesWithinLimit(999, 2025)).toBe(true)
    expect(privateSalesWithinLimit(1000, 2025)).toBe(false)
  })

  it('refuses dates it cannot read or a sale before the purchase', () => {
    expect(() => checkPrivateSale({ kind: 'crypto', acquiredOn: '15.03.2024', soldOn: '2025-03-16' })).toThrow(RangeError)
    expect(() => checkPrivateSale({ kind: 'crypto', acquiredOn: '2025-03-16', soldOn: '2025-03-15' })).toThrow(RangeError)
  })
})
