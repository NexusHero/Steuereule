// What the child form checks before a save and the record it writes.
import { wholeEurosFrom } from '../shared/wholeEuros'
import { germanToIso } from '../master-data/masterDataMapping'
import { GERMAN_DATE_PATTERN, type ChildRelationship, type OtherParentStatus } from '@steuereule/core'
import { wholeText, type ChildInput } from './childrenModel'

/** The form's fields as typed: dates as TT.MM.JJJJ, amounts as text. */
export interface ChildFormValues {
  readonly firstName: string
  readonly lastName: string
  readonly geburtsdatum: string
  readonly taxId: string
  readonly childBenefit: string
  readonly relationship: ChildRelationship | null
  readonly relationshipB: ChildRelationship | null
  readonly familyBenefitsOffice: string
  readonly inland: boolean | null
  readonly ae: OtherParentStatus | null
  readonly opName: string
  readonly opBirthDate: string
  readonly opAddress: string
  readonly opKind: '1' | '2' | null
  readonly opDiedOn: string
  readonly registered: boolean | null
  readonly childBenefitToMe: boolean | null
  readonly kvBasis: string
  readonly pv: string
  readonly healthAbroad: boolean
  readonly swissAllowance: string
  readonly swissPayer: 'A' | 'B' | null
  readonly childcare: string
  readonly childcareProvider: string
  readonly childcareFrom: string
  readonly childcareTo: string
}

/** The other parent's details are asked only when that parent lives in Germany or has died. */
export function otherParentKnown(ae: OtherParentStatus | null): boolean {
  return ae === 'Inland' || ae === 'Verstorben'
}

/** Why the form cannot be saved yet: a required field is empty, or the birth date is unreadable; null when it can. */
export function childFormError(values: Pick<ChildFormValues, 'firstName' | 'lastName' | 'geburtsdatum'>): 'pflicht' | 'datum' | null {
  if (!values.firstName.trim() || !values.lastName.trim() || !values.geburtsdatum.trim()) return 'pflicht'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(germanToIso(values.geburtsdatum) ?? '')) return 'datum'
  return null
}

/** The record a save writes from the typed form. */
export function childPayload(values: ChildFormValues): ChildInput {
  const {
    firstName,
    lastName,
    geburtsdatum,
    taxId,
    childBenefit,
    relationship,
    relationshipB,
    familyBenefitsOffice,
    inland,
    ae,
    opName,
    opBirthDate,
    opAddress,
    opKind,
    opDiedOn,
    registered,
    childBenefitToMe,
    kvBasis,
    pv,
    healthAbroad,
    swissAllowance,
    swissPayer,
    childcare,
    childcareProvider,
    childcareFrom,
    childcareTo,
  } = values
  const opKnown = otherParentKnown(ae)
  return {
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    geburtsdatum: germanToIso(geburtsdatum) ?? '',
    ...(taxId.trim() && { taxId: taxId.trim() }),
    ...(wholeEurosFrom(childBenefit) !== null && { childBenefitClaimEur: String(wholeEurosFrom(childBenefit)) }),
    kinship: relationship,
    kinshipB: relationshipB,
    familyBenefitsOffice: familyBenefitsOffice.trim() || null,
    domesticResidenceAllYear: inland,
    otherParent: ae,
    otherParentName: opKnown ? opName.trim() || null : null,
    otherParentBirthDate: opKnown ? germanToIso(opBirthDate) : null,
    otherParentAddress: opKnown ? opAddress.trim() || null : null,
    otherParentKind: opKnown ? opKind : null,
    otherParentDiedOn: ae === 'Verstorben' ? germanToIso(opDiedOn) : null,
    registeredWithMeAllYear: registered,
    childBenefitToMeAllYear: childBenefitToMe,
    healthBasicEur: wholeText(kvBasis),
    careEur: wholeText(pv),
    healthInsuranceAbroad: healthAbroad,
    swissFamilyAllowanceEur: wholeText(swissAllowance),
    swissFamilyAllowancePayer: swissPayer,
    childcareEur: wholeText(childcare),
    childcareProvider: childcareProvider.trim() || null,
    childcareFrom: GERMAN_DATE_PATTERN.test(childcareFrom.trim()) ? childcareFrom.trim() : null,
    childcareTo: GERMAN_DATE_PATTERN.test(childcareTo.trim()) ? childcareTo.trim() : null,
  }
}
