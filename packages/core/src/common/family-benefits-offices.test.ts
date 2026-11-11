import { describe, expect, it } from 'vitest'
import { FAMILY_BENEFITS_OFFICES, familyBenefitsOfficesForState } from './family-benefits-offices'
import { GERMAN_STATES } from './public-holidays'

describe('Familienkasse suggestions', () => {
  it('offers the one office of a state that has one', () => {
    expect(familyBenefitsOfficesForState('SN')).toEqual(['Familienkasse Sachsen'])
    expect(familyBenefitsOfficesForState('HB')).toEqual(['Familienkasse Niedersachsen-Bremen'])
    expect(familyBenefitsOfficesForState('SL')).toEqual(['Familienkasse Rheinland-Pfalz-Saarland'])
  })

  it('offers every office of a state that has several, never a guess at one', () => {
    expect(familyBenefitsOfficesForState('NW')).toEqual([
      'Familienkasse Nordrhein-Westfalen Nord',
      'Familienkasse Nordrhein-Westfalen Ost',
      'Familienkasse Nordrhein-Westfalen West',
    ])
    expect(familyBenefitsOfficesForState('BY')).toHaveLength(2)
  })

  it('offers all offices when the Bundesland is unknown', () => {
    expect(familyBenefitsOfficesForState(null)).toHaveLength(FAMILY_BENEFITS_OFFICES.length)
  })

  it('covers every Bundesland and names each office once', () => {
    for (const state of GERMAN_STATES) expect(familyBenefitsOfficesForState(state).length).toBeGreaterThan(0)
    const names = FAMILY_BENEFITS_OFFICES.map((office) => office.name)
    expect(new Set(names).size).toBe(names.length)
  })
})
