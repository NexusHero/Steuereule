import { describe, it, expect } from 'vitest'
import { toOnboardingProfile, toPutProfileDto, EMPTY_ONBOARDING_PROFILE } from './profileMapping'

describe('toOnboardingProfil', () => {
  it('maps a saved profile field-by-field, grouping the Steuer-ID/Steuernummer like the typing path (steuereule#60)', () => {
    expect(
      toOnboardingProfile({ firstName: 'Kim', lastName: 'Yilmaz', steuerId: '12345678901', steuernummer: '1234567890' }),
    ).toEqual({ firstName: 'Kim', lastName: 'Yilmaz', steuerId: '12 345 678 901', taxNumber: '12/345/67890' })
  })

  it('maps the all-null default to the empty profile', () => {
    expect(toOnboardingProfile({ firstName: null, lastName: null, steuerId: null, steuernummer: null })).toEqual(
      EMPTY_ONBOARDING_PROFILE,
    )
  })
})

describe('toPutProfileDto (WEB-28: the server keeps what is absent, null clears)', () => {
  const loaded = { firstName: 'Kim', lastName: 'Yilmaz', steuerId: '12 345 678 901', taxNumber: '181/815/08155' }

  it('trims names and sends no identifier the user did not change — absent keeps the stored value', () => {
    expect(toPutProfileDto({ ...loaded, firstName: '  Kim ', lastName: ' Neu' }, loaded)).toEqual({ firstName: 'Kim', lastName: 'Neu' })
  })

  it('sends a changed Steuer-ID without the display grouping', () => {
    expect(toPutProfileDto({ ...loaded, steuerId: '02 476 291 358' }, loaded)).toEqual({
      firstName: 'Kim',
      lastName: 'Yilmaz',
      steuerId: '02476291358',
    })
  })

  it('a regrouped but equal Steuernummer is no change', () => {
    expect(toPutProfileDto({ ...loaded, taxNumber: '18181508155' }, loaded)).toEqual({ firstName: 'Kim', lastName: 'Yilmaz' })
  })

  it('sends null only when the user cleared a stored value', () => {
    expect(toPutProfileDto({ ...loaded, steuerId: '', taxNumber: '' }, loaded)).toEqual({
      firstName: 'Kim',
      lastName: 'Yilmaz',
      steuerId: null,
      steuernummer: null,
    })
  })

  it('an empty field that was empty before is not sent at all', () => {
    const dto = toPutProfileDto({ ...EMPTY_ONBOARDING_PROFILE, firstName: 'Kim', lastName: 'Yilmaz' }, EMPTY_ONBOARDING_PROFILE)
    expect(dto).toEqual({ firstName: 'Kim', lastName: 'Yilmaz' })
  })

  it('strips the "/" grouping from a new steuernummer', () => {
    expect(toPutProfileDto({ ...EMPTY_ONBOARDING_PROFILE, firstName: 'Kim', lastName: 'Yilmaz', taxNumber: '181/815/08155' }, EMPTY_ONBOARDING_PROFILE)).toEqual({
      firstName: 'Kim',
      lastName: 'Yilmaz',
      steuernummer: '18181508155',
    })
  })
})
