import { describe, expect, it } from 'vitest'
import { GERMAN_STATES } from './public-holidays'
import { POSTAL_CODE_SOURCE, POSTAL_CODE_TABLE } from './postal-codes.data'
import { churchTaxRateForState, lookupPostalCode } from './postal-codes'

describe('lookupPostalCode (#451 slice 3)', () => {
  it('finds the one place of a plain postal code', () => {
    expect(lookupPostalCode('10115')).toEqual({ kind: 'found', places: [{ city: 'Berlin', state: 'BE' }] })
    expect(lookupPostalCode('80331')).toEqual({ kind: 'found', places: [{ city: 'München', state: 'BY' }] })
  })

  it('lists every place of an ambiguous postal code, the most likely first, across a state border', () => {
    const result = lookupPostalCode('21039')
    expect(result.kind).toBe('found')
    if (result.kind !== 'found') return
    expect(result.places[0]).toEqual({ city: 'Hamburg', state: 'HH' })
    expect(result.places).toContainEqual({ city: 'Escheburg', state: 'SH' })
    expect(result.places.length).toBeGreaterThan(1)
  })

  it('ignores surrounding blanks', () => {
    expect(lookupPostalCode(' 01067 ').kind).toBe('found')
  })

  it('rejects anything that is not five digits without looking it up', () => {
    expect(lookupPostalCode('1011')).toEqual({ kind: 'invalid' })
    expect(lookupPostalCode('1011a')).toEqual({ kind: 'invalid' })
    expect(lookupPostalCode('')).toEqual({ kind: 'invalid' })
  })

  it('says honestly when a well-formed postal code is not in the table', () => {
    expect(lookupPostalCode('00000')).toEqual({ kind: 'unknown' })
  })
})

describe('postal code table plausibility (decision 8)', () => {
  const lines = POSTAL_CODE_TABLE.split('\n')

  it('holds about 8.200 postal codes, each exactly five digits', () => {
    expect(lines.length).toBeGreaterThan(8000)
    expect(lines.length).toBeLessThan(8400)
    for (const line of lines) expect(line).toMatch(/^\d{5}=[^=]+$/)
  })

  it('covers every Bundesland', () => {
    const states = new Set(lines.flatMap((l) => l.split('=')[1]!.split('|').map((p) => p.split('~')[1])))
    for (const state of GERMAN_STATES) expect(states.has(state)).toBe(true)
  })

  it('names its source, retrieval date and ODbL license', () => {
    expect(POSTAL_CODE_SOURCE.license).toBe('ODbL-1.0')
    expect(POSTAL_CODE_SOURCE.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(POSTAL_CODE_SOURCE.commit).toMatch(/^[0-9a-f]{40}$/)
  })
})

describe('churchTaxRateForState (#450 6F)', () => {
  it('is 8 % in Bayern and Baden-Württemberg', () => {
    expect(churchTaxRateForState('BY')).toBe(0.08)
    expect(churchTaxRateForState('BW')).toBe(0.08)
  })

  it('is 9 % everywhere else', () => {
    for (const state of GERMAN_STATES.filter((s) => s !== 'BY' && s !== 'BW')) expect(churchTaxRateForState(state)).toBe(0.09)
  })
})
