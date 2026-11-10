import { describe, expect, it } from 'vitest'
import { prefillCity, stateForAddress } from './postalCodePrefill'

describe('prefillCity (#451 decision 9)', () => {
  it('fills an empty Ort from a postal code with one place and marks it', () => {
    expect(prefillCity({ plz: '80331', city: '', lastPrefill: null })).toEqual({ city: 'München', prefill: 'München' })
  })

  it('replaces an Ort it filled itself when the postal code changes', () => {
    expect(prefillCity({ plz: '10115', city: 'München', lastPrefill: 'München' })).toEqual({ city: 'Berlin', prefill: 'Berlin' })
  })

  it('never overwrites an Ort the user typed', () => {
    expect(prefillCity({ plz: '10115', city: 'Spandau', lastPrefill: null })).toEqual({ city: 'Spandau', prefill: null })
  })

  it('leaves the choice to the user when a postal code has several places', () => {
    expect(prefillCity({ plz: '21039', city: '', lastPrefill: null })).toEqual({ city: '', prefill: null })
  })

  it('does nothing for an incomplete postal code', () => {
    expect(prefillCity({ plz: '801', city: '', lastPrefill: null })).toEqual({ city: '', prefill: null })
  })
})

describe('stateForAddress', () => {
  it('takes the state of the one place', () => {
    expect(stateForAddress('80331', '')).toBe('BY')
  })

  it('takes the state of the chosen place across a border', () => {
    expect(stateForAddress('21039', 'Escheburg')).toBe('SH')
    expect(stateForAddress('21039', 'hamburg')).toBe('HH')
  })

  it('stays unknown while a cross-border postal code has no chosen place', () => {
    expect(stateForAddress('21039', '')).toBeNull()
  })

  it('stays unknown for an unknown or incomplete postal code', () => {
    expect(stateForAddress('00000', '')).toBeNull()
    expect(stateForAddress('12', '')).toBeNull()
  })
})
