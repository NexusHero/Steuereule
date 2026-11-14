import { describe, expect, it } from 'vitest'
import { commuterAllowanceFrom, statedHomeOfficeDays } from './advisor'

describe('advisor helpers (UX review K1 coverage)', () => {
  it('reads the day count the user named, in the common spellings', () => {
    expect(statedHomeOfficeDays('Ich war 2025 an 80 Tagen im Homeoffice.')).toBe(80)
    expect(statedHomeOfficeDays('80 Tage Homeoffice')).toBe(80)
    expect(statedHomeOfficeDays('an 120 Homeoffice-Tagen')).toBe(120)
    expect(statedHomeOfficeDays('Ich war im Homeoffice.')).toBeNull()
    expect(statedHomeOfficeDays('0 Tage')).toBeNull()
  })

  it('computes no commute without days or distance and falls back to the base rates without a year', () => {
    expect(commuterAllowanceFrom(0, 30)).toBe(0)
    expect(commuterAllowanceFrom(200, 0)).toBe(0)
    expect(commuterAllowanceFrom(200, 10)).toBe(Math.round(200 * 10 * 0.3))
    expect(commuterAllowanceFrom(200, 30)).toBe(Math.round(200 * (20 * 0.3 + 10 * 0.38)))
    expect(commuterAllowanceFrom(200, 30, 2019)).toBe(Math.round(200 * (20 * 0.3 + 10 * 0.38)))
  })
})
