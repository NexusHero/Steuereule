// Pure mask tests for the Onboarding tax-id fields. Named .test.tsx (not .ts) because the vitest
// `include` glob for this app is tsx-only (see apps/mobile-web/vitest.config.ts).
import { describe, it, expect } from 'vitest'
import { formatSteuerId, countDigits, formatSteuerNr } from './format'

describe('formatSteuerId', () => {
  it('groups 11 digits as 2-3-3-3', () => {
    expect(formatSteuerId('12345678901')).toBe('12 345 678 901')
  })

  it('strips non-digit characters before grouping', () => {
    expect(formatSteuerId('12-345/678 901')).toBe('12 345 678 901')
  })

  it('caps input at 11 digits', () => {
    expect(formatSteuerId('123456789012345')).toBe('12 345 678 901')
  })

  it('formats partial groups as digits arrive', () => {
    expect(formatSteuerId('123')).toBe('12 3')
  })

  it('returns an empty string for empty input', () => {
    expect(formatSteuerId('')).toBe('')
  })
})

describe('countDigits', () => {
  it('counts digits regardless of formatting', () => {
    expect(countDigits('12 345 678 901')).toBe(11)
  })

  it('flips to the confirmed state at exactly 11 digits', () => {
    expect(countDigits('12 345 678 90')).toBe(10)
    expect(countDigits('12 345 678 901')).toBe(11)
  })

  it('returns 0 for empty input', () => {
    expect(countDigits('')).toBe(0)
  })
})

describe('formatSteuerNr', () => {
  it('formats digits as 2-3/3/5, preferring a 3-digit leading group', () => {
    expect(formatSteuerNr('1234567890')).toBe('123/456/7890')
  })

  it('caps input at 13 digits', () => {
    expect(formatSteuerNr('12345678901234567')).toBe('123/456/78901')
  })

  it('formats partial groups as digits arrive', () => {
    expect(formatSteuerNr('123')).toBe('123')
  })

  it('falls back to a 2-digit leading group when only 2 digits are available', () => {
    expect(formatSteuerNr('12')).toBe('12')
  })

  it('returns an empty string for empty input', () => {
    expect(formatSteuerNr('')).toBe('')
  })
})
