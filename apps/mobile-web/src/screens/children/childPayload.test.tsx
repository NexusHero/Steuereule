import { describe, expect, it } from 'vitest'
import { childFormError, childPayload, otherParentKnown, type ChildFormValues } from './childPayload'

const EMPTY: ChildFormValues = {
  firstName: '',
  lastName: '',
  geburtsdatum: '',
  taxId: '',
  childBenefit: '',
  relationship: null,
  relationshipB: null,
  familyBenefitsOffice: '',
  inland: null,
  ae: null,
  opName: '',
  opBirthDate: '',
  opAddress: '',
  opKind: null,
  opDiedOn: '',
  registered: null,
  childBenefitToMe: null,
  kvBasis: '',
  pv: '',
  healthAbroad: false,
  swissAllowance: '',
  swissPayer: null,
  childcare: '',
  childcareProvider: '',
  childcareFrom: '',
  childcareTo: '',
}
const FILLED: ChildFormValues = { ...EMPTY, firstName: ' Lina ', lastName: ' Muster ', geburtsdatum: '01.05.2020' }

describe('otherParentKnown', () => {
  it('asks the details for a parent in Germany or one who died', () => {
    expect(otherParentKnown('Inland')).toBe(true)
    expect(otherParentKnown('Verstorben')).toBe(true)
    expect(otherParentKnown('Ausland')).toBe(false)
    expect(otherParentKnown(null)).toBe(false)
  })
})

describe('childFormError', () => {
  it('names a missing required field', () => {
    expect(childFormError({ firstName: 'Lina', lastName: ' ', geburtsdatum: '01.05.2020' })).toBe('pflicht')
  })

  it('names an unreadable birth date', () => {
    expect(childFormError({ firstName: 'Lina', lastName: 'Muster', geburtsdatum: '2020' })).toBe('datum')
  })

  it('lets a complete form through', () => {
    expect(childFormError(FILLED)).toBeNull()
  })
})

describe('childPayload', () => {
  it('trims the names, converts the birth date and leaves out empty extras', () => {
    const payload = childPayload(FILLED)
    expect(payload).toMatchObject({ firstName: 'Lina', lastName: 'Muster', geburtsdatum: '2020-05-01', familyBenefitsOffice: null, healthBasicEur: null, childcareProvider: null })
    expect(payload).not.toHaveProperty('taxId')
    expect(payload).not.toHaveProperty('childBenefitClaimEur')
  })

  it('keeps amounts as whole euros', () => {
    const payload = childPayload({ ...FILLED, childBenefit: '3000,60', kvBasis: '1080,40', swissAllowance: '2748' })
    expect(payload).toMatchObject({ childBenefitClaimEur: '3001', healthBasicEur: '1080', swissFamilyAllowanceEur: '2748' })
  })

  it('drops the other parent details unless that parent is known', () => {
    const details = { opName: 'Muster, Max', opBirthDate: '02.03.1985', opAddress: 'Hauptstr. 1', opKind: '1' as const, opDiedOn: '04.05.2024' }
    expect(childPayload({ ...FILLED, ...details, ae: 'Ausland' })).toMatchObject({ otherParentName: null, otherParentBirthDate: null, otherParentAddress: null, otherParentKind: null, otherParentDiedOn: null })
    expect(childPayload({ ...FILLED, ...details, ae: 'Inland' })).toMatchObject({ otherParentName: 'Muster, Max', otherParentBirthDate: '1985-03-02', otherParentKind: '1', otherParentDiedOn: null })
    expect(childPayload({ ...FILLED, ...details, ae: 'Verstorben' })).toMatchObject({ otherParentDiedOn: '2024-05-04' })
  })

  it('keeps a childcare period only as TT.MM.JJJJ', () => {
    expect(childPayload({ ...FILLED, childcareFrom: ' 01.01.2025 ', childcareTo: '2025-12-31' })).toMatchObject({ childcareFrom: '01.01.2025', childcareTo: null })
  })
})
