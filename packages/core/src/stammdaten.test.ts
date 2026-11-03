import { describe, expect, it } from 'vitest'
import {
  FAMILIENSTAENDE,
  istGueltigeIban,
  istGueltigePlz,
  istGueltigesDatum,
  normalisiereIban,
  RELIGIONSSCHLUESSEL,
} from './stammdaten'

describe('istGueltigeIban (ISO 13616, mod-97)', () => {
  it('accepts a valid German IBAN, with or without spaces', () => {
    expect(istGueltigeIban('DE89370400440532013000')).toBe(true)
    expect(istGueltigeIban('DE89 3704 0044 0532 0130 00')).toBe(true)
  })

  it('accepts a valid foreign IBAN (Grenzgänger with a Swiss account)', () => {
    expect(istGueltigeIban('CH9300762011623852957')).toBe(true)
  })

  it('rejects a transposed digit — the check digits catch it', () => {
    expect(istGueltigeIban('DE89370400440532013001')).toBe(false)
  })

  it('rejects a German IBAN of the wrong length and garbage', () => {
    expect(istGueltigeIban('DE8937040044053201300')).toBe(false)
    expect(istGueltigeIban('kein iban')).toBe(false)
  })

  it('normalises to upper case without spaces', () => {
    expect(normalisiereIban(' de89 3704 0044 0532 0130 00 ')).toBe('DE89370400440532013000')
  })
})

describe('istGueltigePlz', () => {
  it('accepts exactly five digits', () => {
    expect(istGueltigePlz('01067')).toBe(true)
    expect(istGueltigePlz('1067')).toBe(false)
    expect(istGueltigePlz('010670')).toBe(false)
  })
})

describe('istGueltigesDatum', () => {
  it('accepts a real calendar date in ISO form', () => {
    expect(istGueltigesDatum('1990-02-28')).toBe(true)
    expect(istGueltigesDatum('2024-02-29')).toBe(true)
  })

  it('rejects impossible dates and other shapes', () => {
    expect(istGueltigesDatum('1990-02-30')).toBe(false)
    expect(istGueltigesDatum('2023-02-29')).toBe(false)
    expect(istGueltigesDatum('28.02.1990')).toBe(false)
  })
})

describe('closed vocabularies', () => {
  it('carries the Religionsschlüssel of the official ESt 1 A 2025 guide, VD for none', () => {
    expect(RELIGIONSSCHLUESSEL).toContain('VD')
    expect(RELIGIONSSCHLUESSEL).toContain('EV')
    expect(RELIGIONSSCHLUESSEL).toContain('RK')
    expect(RELIGIONSSCHLUESSEL).toHaveLength(15)
  })

  it('carries the Familienstände ESt 1 A Zeile 18 distinguishes', () => {
    expect(FAMILIENSTAENDE).toEqual(['ledig', 'verheiratet', 'verwitwet', 'geschieden', 'dauernd-getrennt'])
  })
})
