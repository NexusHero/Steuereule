import { describe, expect, it } from 'vitest'
import { autoCompleteProps } from './autoComplete'

describe('autoCompleteProps (#451 slice 2)', () => {
  it('passes the HTML token through on the web', () => {
    expect(autoCompleteProps('bday', 'web')).toEqual({ autoComplete: 'bday' })
    expect(autoCompleteProps('address-level2', 'web')).toEqual({ autoComplete: 'address-level2' })
  })

  it('maps to the native names on Android', () => {
    expect(autoCompleteProps('bday', 'android')).toEqual({ autoComplete: 'birthdate-full' })
    expect(autoCompleteProps('address-level2', 'android')).toEqual({ autoComplete: 'postal-address-locality' })
  })

  it('adds the iOS content type', () => {
    expect(autoCompleteProps('one-time-code', 'ios')).toEqual({ autoComplete: 'one-time-code', textContentType: 'oneTimeCode' })
    expect(autoCompleteProps('off', 'ios')).toEqual({ autoComplete: 'off', textContentType: 'none' })
  })
})
