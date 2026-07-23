import { describe, it, expect } from 'vitest'
import { toOnboardingProfil, toPutProfileDto, EMPTY_ONBOARDING_PROFIL } from './profileMapping'

describe('toOnboardingProfil', () => {
  it('maps a saved profile field-by-field, grouping the Steuer-ID/Steuernummer like the typing path (steuereule#60)', () => {
    expect(
      toOnboardingProfil({ firstName: 'Kim', lastName: 'Yilmaz', steuerId: '12345678901', steuernummer: '1234567890' }),
    ).toEqual({ vorname: 'Kim', nachname: 'Yilmaz', steuerId: '12 345 678 901', steuerNr: '123/456/7890' })
  })

  it('maps the all-null default to the empty profile', () => {
    expect(toOnboardingProfil({ firstName: null, lastName: null, steuerId: null, steuernummer: null })).toEqual(
      EMPTY_ONBOARDING_PROFIL,
    )
  })
})

describe('toPutProfileDto', () => {
  it('trims names and strips the display grouping from steuerId', () => {
    expect(
      toPutProfileDto({ vorname: '  Kim ', nachname: ' Yilmaz', steuerId: '12 345 678 901', steuerNr: '' }),
    ).toEqual({ firstName: 'Kim', lastName: 'Yilmaz', steuerId: '12345678901' })
  })

  it('omits steuernummer entirely when it was skipped, rather than sending an empty string', () => {
    const dto = toPutProfileDto({ vorname: 'Kim', nachname: 'Yilmaz', steuerId: '12345678901', steuerNr: '' })
    expect('steuernummer' in dto).toBe(false)
  })

  it('strips the "/" grouping from a present steuernummer', () => {
    expect(
      toPutProfileDto({ vorname: 'Kim', nachname: 'Yilmaz', steuerId: '12345678901', steuerNr: '181/815/08155' }),
    ).toEqual({ firstName: 'Kim', lastName: 'Yilmaz', steuerId: '12345678901', steuernummer: '18181508155' })
  })
})
