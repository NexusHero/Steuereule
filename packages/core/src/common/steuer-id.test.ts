import { describe, expect, it } from 'vitest'
import { checkTaxId, isValidTaxId, isValidTaxNumber } from './steuer-id'

// Boundary table for the shape rules the Onboarding PUT /v1/profile endpoint enforces
// server-side. This table is the single source of truth the frontend formatter (#27)
// and the backend DTO validator (#29) both trace to — it must never be duplicated.
describe('isValidSteuerId', () => {
  it('rejects an empty string', () => {
    expect(isValidTaxId('')).toBe(false)
  })

  it('rejects 10 digits (one short)', () => {
    expect(isValidTaxId('1234567890')).toBe(false)
  })

  it('rejects 12 digits (one too many)', () => {
    expect(isValidTaxId('123456789012')).toBe(false)
  })

  it('rejects a non-digit character mixed in', () => {
    expect(isValidTaxId('1234567890a')).toBe(false)
  })

  it('rejects internal whitespace', () => {
    expect(isValidTaxId('123 456 789')).toBe(false)
  })

  it('rejects leading whitespace', () => {
    expect(isValidTaxId(' 12345678901')).toBe(false)
  })

  it('rejects trailing whitespace', () => {
    expect(isValidTaxId('12345678901 ')).toBe(false)
  })

  it('accepts exactly 11 digits', () => {
    expect(isValidTaxId('12345678901')).toBe(true)
  })
})

describe('isValidSteuernummer', () => {
  it('accepts undefined (field is optional)', () => {
    expect(isValidTaxNumber(undefined)).toBe(true)
  })

  it('accepts null (field is optional)', () => {
    expect(isValidTaxNumber(null)).toBe(true)
  })

  it('rejects an empty string (present but empty is not a valid value)', () => {
    expect(isValidTaxNumber('')).toBe(false)
  })

  it('rejects 14 digits (one too many)', () => {
    expect(isValidTaxNumber('12345678901234')).toBe(false)
  })

  it('rejects a non-digit character mixed in', () => {
    expect(isValidTaxNumber('123456789012a')).toBe(false)
  })

  it('rejects internal whitespace', () => {
    expect(isValidTaxNumber('123 456')).toBe(false)
  })

  it('accepts 1 digit (lower bound)', () => {
    expect(isValidTaxNumber('1')).toBe(true)
  })

  it('accepts 13 digits (upper bound)', () => {
    expect(isValidTaxNumber('1234567890123')).toBe(true)
  })
})

describe('checkTaxId (#452 decision 11)', () => {
  it('accepts real-shaped Steuer-IDs with a correct check digit', () => {
    for (const id of ['86095742719', '47036892816', '65929970489']) expect(checkTaxId(id)).toBe('valid')
    expect(checkTaxId('860 957 427 19')).toBe('valid')
  })

  it('rejects a wrong check digit, a leading 0 and a wrong digit distribution', () => {
    expect(checkTaxId('86095742718')).toBe('invalid')
    expect(checkTaxId('06095742719')).toBe('invalid')
    expect(checkTaxId('12345678901')).toBe('invalid')
  })

  it('stays quiet while the number is still being typed', () => {
    expect(checkTaxId('')).toBe('incomplete')
    expect(checkTaxId('8609574')).toBe('incomplete')
    expect(checkTaxId('86x')).toBe('invalid')
  })
})
