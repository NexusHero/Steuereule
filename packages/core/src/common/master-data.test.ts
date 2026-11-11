import { describe, expect, it } from 'vitest'
import {
  MARITAL_STATUSES,
  checkIban,
  formatIban,
  isValidIban,
  isValidPostalCode,
  isValidDate,
  normalizeIban,
  RELIGION_KEYS,
} from './master-data'

describe('istGueltigeIban (ISO 13616, mod-97)', () => {
  it('accepts a valid German IBAN, with or without spaces', () => {
    expect(isValidIban('DE89370400440532013000')).toBe(true)
    expect(isValidIban('DE89 3704 0044 0532 0130 00')).toBe(true)
  })

  it('accepts a valid foreign IBAN (Grenzgänger with a Swiss account)', () => {
    expect(isValidIban('CH9300762011623852957')).toBe(true)
  })

  it('rejects a transposed digit — the check digits catch it', () => {
    expect(isValidIban('DE89370400440532013001')).toBe(false)
  })

  it('rejects a German IBAN of the wrong length and garbage', () => {
    expect(isValidIban('DE8937040044053201300')).toBe(false)
    expect(isValidIban('kein iban')).toBe(false)
  })

  it('normalises to upper case without spaces', () => {
    expect(normalizeIban(' de89 3704 0044 0532 0130 00 ')).toBe('DE89370400440532013000')
  })
})

describe('istGueltigePlz', () => {
  it('accepts exactly five digits', () => {
    expect(isValidPostalCode('01067')).toBe(true)
    expect(isValidPostalCode('1067')).toBe(false)
    expect(isValidPostalCode('010670')).toBe(false)
  })
})

describe('istGueltigesDatum', () => {
  it('accepts a real calendar date in ISO form', () => {
    expect(isValidDate('1990-02-28')).toBe(true)
    expect(isValidDate('2024-02-29')).toBe(true)
  })

  it('rejects impossible dates and other shapes', () => {
    expect(isValidDate('1990-02-30')).toBe(false)
    expect(isValidDate('2023-02-29')).toBe(false)
    expect(isValidDate('28.02.1990')).toBe(false)
  })
})

describe('closed vocabularies', () => {
  it('carries the Religionsschlüssel of the official ESt 1 A 2025 guide, VD for none', () => {
    expect(RELIGION_KEYS).toContain('VD')
    expect(RELIGION_KEYS).toContain('EV')
    expect(RELIGION_KEYS).toContain('RK')
    expect(RELIGION_KEYS).toHaveLength(15)
  })

  it('carries the Familienstände ESt 1 A Zeile 18 distinguishes', () => {
    expect(MARITAL_STATUSES).toEqual(['ledig', 'verheiratet', 'verwitwet', 'geschieden', 'dauernd-getrennt'])
  })
})

describe('IBAN display and typing check', () => {
  it('groups an IBAN in blocks of four, upper-cased', () => {
    expect(formatIban('de89370400440532013000')).toBe('DE89 3704 0044 0532 0130 00')
    expect(formatIban('DE89 37040044 0532')).toBe('DE89 3704 0044 0532')
    expect(formatIban('DE89')).toBe('DE89')
    expect(formatIban('')).toBe('')
  })

  it('drops characters an IBAN cannot contain and stops at 34', () => {
    expect(formatIban('DE89-3704.0044')).toBe('DE89 3704 0044')
    expect(formatIban('X'.repeat(40)).replace(/ /g, '')).toHaveLength(34)
  })

  it('tells empty, incomplete, valid and invalid apart while typing', () => {
    expect(checkIban('')).toBe('empty')
    expect(checkIban('DE89 3704')).toBe('incomplete')
    expect(checkIban('DE89 3704 0044 0532 0130 00')).toBe('valid')
    expect(checkIban('DE89 3704 0044 0532 0130 01')).toBe('invalid')
    expect(checkIban('DE89 3704 0044 0532 0130 000')).toBe('invalid')
    expect(checkIban('CH93 0076 2011 6238 5295 7')).toBe('valid')
    expect(checkIban('CH93 0076')).toBe('incomplete')
  })
})
