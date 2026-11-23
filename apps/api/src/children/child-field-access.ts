import type { ScreenAccess } from '../common/screen-access.js'
import type { ChildRepository } from './child.repository.js'

export const CHILD_ACCESS_FIELDS = [
  'firstName',
  'lastName',
  'geburtsdatum',
  'taxId',
  'childBenefitClaimEur',
  'kinship',
  'kinshipB',
  'familyBenefitsOffice',
  'domesticResidenceAllYear',
  'otherParent',
  'otherParentName',
  'otherParentBirthDate',
  'otherParentAddress',
  'otherParentKind',
  'otherParentDiedOn',
  'registeredWithMeAllYear',
  'childBenefitToMeAllYear',
  'healthBasicEur',
  'careEur',
  'swissFamilyAllowanceEur',
  'childcareEur',
  'childcareProvider',
  'childcareFrom',
  'childcareTo',
  'swissFamilyAllowancePayer',
  'healthInsuranceAbroad',
] as const

/** The confirmation path's view of the screen `kind` (ADR-0066): the instance is the child's id. */
export function childFieldAccess(child: ChildRepository): ScreenAccess {
  return {
    fields: CHILD_ACCESS_FIELDS,
    withInstance: true,
    async read(userId, taxYear, instance) {
      if (instance === null) return null
      const list = await child.listForUserAndYear(userId, taxYear)
      const c = list.find((k) => k.id === instance)
      if (!c) return null
      return {
        firstName: c.firstName,
        lastName: c.lastName,
        geburtsdatum: c.geburtsdatum,
        taxId: c.taxId,
        childBenefitClaimEur: c.childBenefitClaimEur,
        kinship: c.kinship,
        kinshipB: c.kinshipB,
        familyBenefitsOffice: c.familyBenefitsOffice,
        domesticResidenceAllYear: c.domesticResidenceAllYear === null ? null : String(c.domesticResidenceAllYear),
        otherParent: c.otherParent,
        otherParentName: c.otherParentName,
        otherParentBirthDate: c.otherParentBirthDate,
        otherParentAddress: c.otherParentAddress,
        otherParentKind: c.otherParentKind,
        otherParentDiedOn: c.otherParentDiedOn,
        registeredWithMeAllYear: c.registeredWithMeAllYear === null ? null : String(c.registeredWithMeAllYear),
        childBenefitToMeAllYear: c.childBenefitToMeAllYear === null ? null : String(c.childBenefitToMeAllYear),
        healthBasicEur: c.healthBasicEur,
        careEur: c.careEur,
        swissFamilyAllowanceEur: c.swissFamilyAllowanceEur,
        childcareEur: c.childcareEur ?? null,
        childcareProvider: c.childcareProvider ?? null,
        childcareFrom: c.childcareFrom ?? null,
        childcareTo: c.childcareTo ?? null,
        swissFamilyAllowancePayer: c.swissFamilyAllowancePayer ?? null,
        healthInsuranceAbroad: c.healthInsuranceAbroad === null || c.healthInsuranceAbroad === undefined ? null : String(c.healthInsuranceAbroad),
      }
    },
    async write(userId, taxYear, instance, field, value) {
      if (instance === null) return false
      const boolFields = ['domesticResidenceAllYear', 'registeredWithMeAllYear', 'childBenefitToMeAllYear', 'healthInsuranceAbroad']
      const parsedValue = boolFields.includes(field) ? (value === 'true' ? true : value === 'false' ? false : null) : value
      const updated = await child.update(userId, taxYear, instance, { [field]: parsedValue })
      return updated !== null
    },
  }
}
