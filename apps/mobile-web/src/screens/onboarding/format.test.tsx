// Pure mask tests for the Onboarding tax-id fields. Named .test.tsx (not .ts) because the vitest
// `include` glob for this app is tsx-only (see apps/mobile-web/vitest.config.ts).
import { describe, it, expect } from 'vitest'
import { formatTaxId, countDigits, sanitizeTaxNumberInput, formatStoredTaxNumber } from './format'

describe('formatSteuerId', () => {
  it('groups 11 digits as 2-3-3-3', () => {
    expect(formatTaxId('12345678901')).toBe('12 345 678 901')
  })

  it('strips non-digit characters before grouping', () => {
    expect(formatTaxId('12-345/678 901')).toBe('12 345 678 901')
  })

  it('caps input at 11 digits', () => {
    expect(formatTaxId('123456789012345')).toBe('12 345 678 901')
  })

  it('formats partial groups as digits arrive', () => {
    expect(formatTaxId('123')).toBe('12 3')
  })

  it('returns an empty string for empty input', () => {
    expect(formatTaxId('')).toBe('')
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

describe('sanitizeTaxNumberInput', () => {
  it('keeps the Bundesland layout the user types instead of regrouping it', () => {
    expect(sanitizeTaxNumberInput('06/123/45678')).toBe('06/123/45678')
    expect(sanitizeTaxNumberInput('123/4567/8901')).toBe('123/4567/8901')
  })

  it('drops letters and doubled or leading separators', () => {
    expect(sanitizeTaxNumberInput('/06//12a3')).toBe('06/123')
  })

  it('caps input at 13 digits', () => {
    expect(sanitizeTaxNumberInput('12345678901234567')).toBe('1234567890123')
  })
})

describe('formatStoredTaxNumber', () => {
  it('groups a 10-digit Landesformat as 2/3/5', () => {
    expect(formatStoredTaxNumber('0612345678')).toBe('06/123/45678')
  })

  it('leaves 11-digit numbers ungrouped because Bayern and NRW group them differently', () => {
    expect(formatStoredTaxNumber('18181508155')).toBe('18181508155')
  })

  it('returns an empty string for empty input', () => {
    expect(formatStoredTaxNumber('')).toBe('')
  })
})
