import { describe, expect, it } from 'vitest'
import { checkTaxId, inspectTaxId, isValidTaxId, isValidTaxNumber } from './steuer-id'

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

// #67: the „gültig“ sticker may only claim what was checked. Synthetic numbers; none is a person's Steuer-ID.
describe('inspectTaxId', () => {
  const VALID = ['86095742719', '47036892816', '65929970489'] as const

  const withDigit = (id: string, at: number, digit: number): string => id.slice(0, at) + String(digit) + id.slice(at + 1)

  it('finds a number with a correct check digit valid, with or without the spaces the form shows', () => {
    for (const id of VALID) expect(inspectTaxId(id)).toBe('valid')
    expect(inspectTaxId('86 095 742 719')).toBe('valid')
  })

  it.each(VALID)('rejects every single mistyped digit of %s as a failed check, at each of the 11 places', (id) => {
    const typos = Array.from({ length: 11 }, (_unused, at) => at).flatMap((at) =>
      Array.from({ length: 10 }, (_unused, digit) => digit)
        .filter((digit) => String(digit) !== id[at])
        .map((digit) => withDigit(id, at, digit)),
    )
    expect(typos).toHaveLength(99)
    expect(typos.filter((typo) => inspectTaxId(typo) !== 'failed-check')).toEqual([])
  })

  it('catches two neighbouring digits in the wrong order in most cases, and not in all', () => {
    const swapped = (id: string): string[] =>
      Array.from({ length: 10 }, (_unused, at) => at)
        .filter((at) => id[at] !== id[at + 1])
        .map((at) => id.slice(0, at) + id[at + 1]! + id[at]! + id.slice(at + 2))

    expect(swapped('86095742719').filter((id) => inspectTaxId(id) === 'valid')).toEqual([])
    expect(swapped('47036892816').filter((id) => inspectTaxId(id) === 'valid')).toEqual([])
    // The limit of ISO 7064 MOD 11,10: this swap of the first two digits yields another number that passes.
    expect(swapped('65929970489').filter((id) => inspectTaxId(id) === 'valid')).toEqual(['56929970489'])
  })

  it('tells eleven digits that cannot be a Steuer-ID from an entry that is not eleven digits', () => {
    expect(inspectTaxId('06095742719')).toBe('failed-check')
    expect(inspectTaxId('12345678901')).toBe('failed-check')
    expect(inspectTaxId('11111111111')).toBe('failed-check')
    expect(inspectTaxId('860957427190')).toBe('malformed')
    expect(inspectTaxId('8609574271a')).toBe('malformed')
    expect(inspectTaxId('86x')).toBe('malformed')
  })

  it('stays quiet while the number is still being typed', () => {
    expect(inspectTaxId('')).toBe('incomplete')
    expect(inspectTaxId('8609574271')).toBe('incomplete')
  })

  it('checkTaxId is the same verdict without the reason', () => {
    expect(checkTaxId('86095742719')).toBe('valid')
    expect(checkTaxId('86095742718')).toBe('invalid')
    expect(checkTaxId('860957427190')).toBe('invalid')
    expect(checkTaxId('8609')).toBe('incomplete')
  })
})
