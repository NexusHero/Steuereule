// Figures and suggestions the children mask derives from what is stored or typed.
import {
  FAMILY_BENEFITS_OFFICES,
  claimMonths,
  familyBenefitsOfficesForState,
  monthlyChildBenefitClaim,
  type GermanState,
} from '@steuereule/core'
import { type PickedAddress } from '../shared/AddressSearch'
import { type ChildItem } from './childrenModel'

/** The children as the core's status calculation reads them. */
export function childStatusInputs(kinder: readonly ChildItem[]) {
  return kinder.map((k) => ({
    id: k.id,
    firstName: k.firstName,
    lastName: k.lastName,
    birthDate: k.geburtsdatum,
    taxId: k.taxId ?? null,
    childBenefit: k.childBenefitClaimEur ? Number(k.childBenefitClaimEur) : null,
    swissFamilyAllowanceEur: k.swissFamilyAllowanceEur ? Number(k.swissFamilyAllowanceEur) : null,
  }))
}

/** The Kindergeld the law grants for the months of the year the child was alive. */
export function statutoryChildBenefit(birthDate: string, taxYear: number): number {
  return monthlyChildBenefitClaim(taxYear) * claimMonths(birthDate, taxYear)
}

/** Differenz-Kindergeld: the server's figure, else the statutory claim less the Swiss allowance, never below zero. */
export function differentialChildBenefit(k: ChildItem, taxYear: number): number {
  return Number(k.differentialChildBenefitEur ?? Math.max(0, statutoryChildBenefit(k.geburtsdatum, taxYear) - Number(k.swissFamilyAllowanceEur)))
}

/** Gesamtanspruch (Anlage Kind Z. 6): the server's figure, the entered claim, else the larger of statutory claim and Swiss allowance. */
export function totalChildBenefitClaim(k: ChildItem, taxYear: number): number {
  return Number(k.totalClaimEur ?? k.childBenefitClaimEur ?? Math.max(statutoryChildBenefit(k.geburtsdatum, taxYear), Number(k.swissFamilyAllowanceEur)))
}

/** The typed Familienkasse, lower-cased and trimmed, as the suggestions compare it. */
export function typedOfficeOf(familyBenefitsOffice: string): string {
  return familyBenefitsOffice.trim().toLocaleLowerCase('de')
}

// Familienkasse: pick instead of type. Empty field → the offices of the user's Bundesland;
// typed text → every office containing it; a complete name → nothing left to offer.
export function officeSuggestionsFor(typedOffice: string, addressState: GermanState | null) {
  return typedOffice === ''
    ? familyBenefitsOfficesForState(addressState)
    : FAMILY_BENEFITS_OFFICES.map((office) => office.name).filter(
        (name) => name.toLocaleLowerCase('de').includes(typedOffice) && name.toLocaleLowerCase('de') !== typedOffice,
      )
}

/** Whether the folded further details open for this child: it already has one of them. */
export function hasFurtherDetails(k: ChildItem | null, married: boolean): boolean {
  return Boolean(k && (k.childBenefitClaimEur || k.swissFamilyAllowanceEur || k.healthBasicEur || k.careEur || k.childcareEur || (!married && k.kinshipB)))
}

/** A picked address as one line: „Straße 1a, 12345 Ort“. */
export function addressLine(address: PickedAddress): string {
  const number = address.houseNumber !== null ? ` ${address.houseNumber}${address.houseNumberSuffix ?? ''}` : ''
  return `${address.street}${number}, ${address.postalCode} ${address.city}`
}
