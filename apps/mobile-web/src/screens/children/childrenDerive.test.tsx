import { describe, expect, it } from 'vitest'
import { FAMILY_BENEFITS_OFFICES, familyBenefitsOfficesForState, monthlyChildBenefitClaim } from '@steuereule/core'
import { type ChildItem } from './childrenModel'
import {
  addressLine,
  childStatusInputs,
  differentialChildBenefit,
  hasFurtherDetails,
  officeSuggestionsFor,
  statutoryChildBenefit,
  totalChildBenefitClaim,
  typedOfficeOf,
} from './childrenDerive'

const CHILD: ChildItem = { id: 'k1', sequenceNumber: 1, firstName: 'Lina', lastName: 'Muster', geburtsdatum: '2020-05-01' }
const YEAR = 2025
const FULL_YEAR = monthlyChildBenefitClaim(YEAR) * 12

describe('childStatusInputs', () => {
  it('maps the stored strings to the numbers the core reads', () => {
    expect(childStatusInputs([{ ...CHILD, taxId: '1', childBenefitClaimEur: '3000', swissFamilyAllowanceEur: '2748' }])).toEqual([
      { id: 'k1', firstName: 'Lina', lastName: 'Muster', birthDate: '2020-05-01', taxId: '1', childBenefit: 3000, swissFamilyAllowanceEur: 2748 },
    ])
  })

  it('leaves absent amounts and tax id as null', () => {
    expect(childStatusInputs([CHILD])[0]).toMatchObject({ taxId: null, childBenefit: null, swissFamilyAllowanceEur: null })
  })
})

describe('statutoryChildBenefit', () => {
  it('grants twelve months for a child born before the year', () => {
    expect(statutoryChildBenefit('2020-05-01', YEAR)).toBe(FULL_YEAR)
  })

  it('counts the months from the birth month in the birth year', () => {
    expect(statutoryChildBenefit(`${YEAR}-11-03`, YEAR)).toBe(monthlyChildBenefitClaim(YEAR) * 2)
  })
})

describe('differentialChildBenefit', () => {
  it('prefers the server figure', () => {
    expect(differentialChildBenefit({ ...CHILD, differentialChildBenefitEur: '12', swissFamilyAllowanceEur: '100' }, YEAR)).toBe(12)
  })

  it('tops the Swiss allowance up to the statutory claim, never below zero', () => {
    expect(differentialChildBenefit({ ...CHILD, swissFamilyAllowanceEur: '1000' }, YEAR)).toBe(FULL_YEAR - 1000)
    expect(differentialChildBenefit({ ...CHILD, swissFamilyAllowanceEur: String(FULL_YEAR + 500) }, YEAR)).toBe(0)
  })
})

describe('totalChildBenefitClaim', () => {
  it('prefers the server total, then the entered claim', () => {
    expect(totalChildBenefitClaim({ ...CHILD, totalClaimEur: '4000', childBenefitClaimEur: '3000' }, YEAR)).toBe(4000)
    expect(totalChildBenefitClaim({ ...CHILD, childBenefitClaimEur: '3000' }, YEAR)).toBe(3000)
  })

  it('falls back to the larger of statutory claim and Swiss allowance', () => {
    expect(totalChildBenefitClaim({ ...CHILD, swissFamilyAllowanceEur: '1000' }, YEAR)).toBe(FULL_YEAR)
    expect(totalChildBenefitClaim({ ...CHILD, swissFamilyAllowanceEur: String(FULL_YEAR + 500) }, YEAR)).toBe(FULL_YEAR + 500)
  })
})

describe('officeSuggestionsFor', () => {
  it('offers the offices of the state for an empty field', () => {
    expect(officeSuggestionsFor(typedOfficeOf('  '), 'BY')).toEqual(familyBenefitsOfficesForState('BY'))
  })

  it('offers every office containing the typed text', () => {
    expect(officeSuggestionsFor(typedOfficeOf('Bayern'), null)).toEqual(['Familienkasse Bayern Nord', 'Familienkasse Bayern Süd'])
  })

  it('offers nothing once a complete name is typed', () => {
    const name = FAMILY_BENEFITS_OFFICES[0]!.name
    expect(officeSuggestionsFor(typedOfficeOf(name), null)).not.toContain(name)
  })
})

describe('hasFurtherDetails', () => {
  it('stays folded for a new child or one without further details', () => {
    expect(hasFurtherDetails(null, false)).toBe(false)
    expect(hasFurtherDetails(CHILD, false)).toBe(false)
  })

  it('opens for a child with an amount', () => {
    expect(hasFurtherDetails({ ...CHILD, careEur: '50' }, false)).toBe(true)
  })

  it('opens for the spouse relationship only when it sits among the further details', () => {
    expect(hasFurtherDetails({ ...CHILD, kinshipB: '1' }, false)).toBe(true)
    expect(hasFurtherDetails({ ...CHILD, kinshipB: '1' }, true)).toBe(false)
  })
})

describe('addressLine', () => {
  it('joins street, house number and place', () => {
    expect(addressLine({ street: 'Hauptstr.', houseNumber: '12', houseNumberSuffix: 'a', postalCode: '79539', city: 'Lörrach' })).toBe('Hauptstr. 12a, 79539 Lörrach')
  })

  it('leaves out a house number that was not typed', () => {
    expect(addressLine({ street: 'Hauptstr.', houseNumber: null, houseNumberSuffix: null, postalCode: '79539', city: 'Lörrach' })).toBe('Hauptstr., 79539 Lörrach')
  })
})
