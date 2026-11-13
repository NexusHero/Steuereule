import { describe, expect, it } from 'vitest'
import { childcareDeductionEur } from './childcare'

describe('childcareDeductionEur', () => {
  it('counts 80 % up to 4.800 € from 2025', () => {
    expect(childcareDeductionEur(2025, 739)).toBe(591)
    expect(childcareDeductionEur(2025, 9000)).toBe(4800)
  })

  it('counts two thirds up to 4.000 € before 2025', () => {
    expect(childcareDeductionEur(2024, 900)).toBe(600)
    expect(childcareDeductionEur(2024, 9000)).toBe(4000)
  })

  it('counts nothing for a child older than 14 or without costs', () => {
    expect(childcareDeductionEur(2025, 1000, '2008-05-01')).toBe(0)
    expect(childcareDeductionEur(2025, 1000, '2015-05-01')).toBe(800)
    expect(childcareDeductionEur(2025, null)).toBe(0)
  })
})
