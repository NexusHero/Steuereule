// The children mask's records and the labels it shows for them.
import { wholeEurosFrom } from '../shared/wholeEuros'
import { type ChildRelationship, type OtherParentStatus } from '@steuereule/core'

/** A typed amount as the whole euros the record keeps („266,48“ → „266“); unreadable or empty is not entered. */
export const wholeText = (text: string): string | null => {
  const amount = wholeEurosFrom(text)
  return amount === null ? null : String(amount)
}

export interface ChildItem {
  id: string
  sequenceNumber: number
  firstName: string
  lastName: string
  geburtsdatum: string
  taxId?: string | null
  childBenefitClaimEur?: string | null
  kinship?: ChildRelationship | null
  kinshipB?: ChildRelationship | null
  familyBenefitsOffice?: string | null
  domesticResidenceAllYear?: boolean | null
  otherParent?: OtherParentStatus | null
  otherParentName?: string | null
  otherParentBirthDate?: string | null
  otherParentAddress?: string | null
  otherParentKind?: '1' | '2' | null
  otherParentDiedOn?: string | null
  registeredWithMeAllYear?: boolean | null
  childBenefitToMeAllYear?: boolean | null
  healthBasicEur?: string | null
  careEur?: string | null
  swissFamilyAllowanceEur?: string | null
  childcareEur?: string | null
  childcareProvider?: string | null
  childcareFrom?: string | null
  childcareTo?: string | null
  swissFamilyAllowancePayer?: 'A' | 'B' | null
  healthInsuranceAbroad?: boolean | null
  swissFamilyAllowanceDerived?: boolean
  differentialChildBenefitEur?: string | null
  totalClaimEur?: string | null
}

/** What the form writes: the identity plus the Anlage-Kind facts. */
export interface ChildInput {
  firstName: string
  lastName: string
  geburtsdatum: string
  taxId?: string
  childBenefitClaimEur?: string
  kinship: ChildRelationship | null
  kinshipB: ChildRelationship | null
  familyBenefitsOffice: string | null
  domesticResidenceAllYear: boolean | null
  otherParent: OtherParentStatus | null
  otherParentName: string | null
  otherParentBirthDate: string | null
  otherParentAddress: string | null
  otherParentKind: '1' | '2' | null
  otherParentDiedOn: string | null
  registeredWithMeAllYear: boolean | null
  childBenefitToMeAllYear: boolean | null
  healthBasicEur: string | null
  careEur: string | null
  swissFamilyAllowanceEur?: string | null
  /** Anlage Kind Zeile 67 (ADR-0076): childcare paid, provider, period as TT.MM.JJJJ. */
  childcareEur?: string | null
  childcareProvider?: string | null
  childcareFrom?: string | null
  childcareTo?: string | null
  swissFamilyAllowancePayer?: 'A' | 'B' | null
  healthInsuranceAbroad?: boolean | null
}

export const OTHER_PARENT_LABEL: Record<OtherParentStatus, string> = {
  Inland: 'Lebt in Deutschland',
  Ausland: 'Lebt im Ausland',
  Verstorben: 'Ist verstorben',
  Unbekannt: 'Nicht zu ermitteln',
}

export const KINSHIP_LABEL: Record<ChildRelationship, string> = {
  '1': 'Leibliches Kind / Adoptivkind',
  '2': 'Pflegekind',
  '3': 'Enkelkind / Stiefkind',
}

export type PrintoutGap = 'steuerId' | 'kindschaft' | 'familienkasse' | 'wohnsitz'

export const GAP_LABEL: Record<PrintoutGap, string> = {
  steuerId: 'Steuer-ID',
  kindschaft: 'Kindschaftsverhältnis',
  familienkasse: 'Familienkasse',
  wohnsitz: 'Wohnsitz',
}

/** What the printout still lacks for this child — only those, never the whole list (Echtdatentest 18.11.2026). */
export function missingForPrintout(k: ChildItem): readonly PrintoutGap[] {
  return [
    ...(k.taxId ? [] : ['steuerId' as const]),
    ...(k.kinship ? [] : ['kindschaft' as const]),
    ...(k.familyBenefitsOffice ? [] : ['familienkasse' as const]),
    ...(k.domesticResidenceAllYear == null ? ['wohnsitz' as const] : []),
  ]
}
