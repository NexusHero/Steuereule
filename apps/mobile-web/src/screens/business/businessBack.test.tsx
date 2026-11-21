import { describe, expect, it } from 'vitest'
import { BUSINESS_PAGES, parentPage } from './BusinessScreen'

describe('back in the self-employed area', () => {
  it('leads from the profile’s own pages back to the profile (09b in CI, 21.11.2026)', () => {
    expect(parentPage('beruf')).toBe('profil')
    expect(parentPage('gewerbedaten')).toBe('profil')
    expect(parentPage('beteiligungen')).toBe('profil')
  })

  it('leads from every other page to the overview', () => {
    const others = BUSINESS_PAGES.filter((p) => p !== 'beruf' && p !== 'gewerbedaten' && p !== 'beteiligungen')
    expect(others.map(parentPage).every((p) => p === undefined)).toBe(true)
  })
})
