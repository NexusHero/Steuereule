// Anlage Kind: one form per child, and what of a child's details still blocks the print.
import { calculateDifferentialChildBenefit, formatGermanDate } from '@steuereule/core'
import type { ChildFacts, PrintoutFacts } from './facts.js'
import { formHeader, isJoint, type Fields, type Section } from './section.js'

function needsOtherParent(k: ChildFacts, joint: boolean): boolean {
  return !joint || !k.kinshipB
}

function otherParentGap(k: ChildFacts): string | null {
  const known = Boolean(k.otherParentName && k.otherParentBirthDate && k.otherParentKind)
  switch (k.otherParent) {
    case 'Unbekannt':
      return null
    case 'Ausland':
      return 'anlageKindAndererElternteilAusland'
    case 'Inland':
      return known && k.otherParentAddress ? null : 'kinder'
    case 'Verstorben':
      return known && k.otherParentDiedOn ? null : 'kinder'
    default:
      return 'kinder'
  }
}

export function childGap(k: ChildFacts, taxYear: number, joint: boolean): string | null {
  if (!k.taxId || !k.kinship || !k.familyBenefitsOffice || k.domesticResidenceAllYear == null) return 'kinder'
  if (!k.domesticResidenceAllYear) return 'anlageKindAusland'
  if (k.geburtsdatum && Number(k.geburtsdatum.slice(0, 4)) <= taxYear - 18) return 'anlageKindVolljaehrig'
  return needsOtherParent(k, joint) ? otherParentGap(k) : null
}

/** What of a child's details stops the Anlage Kind; `child` = children were named but none is recorded. */
export type ChildGapField = 'child' | 'taxId' | 'kinship' | 'familyBenefitsOffice' | 'residence' | 'otherParent'

export const CHILD_GAP_ORDER: readonly ChildGapField[] = ['child', 'taxId', 'kinship', 'familyBenefitsOffice', 'residence', 'otherParent']

/** The details behind a child's „kinder“ gap, so the hint names them instead of listing all that could be missing. */
export function childGapFields(k: ChildFacts, taxYear: number, joint: boolean): ChildGapField[] {
  if (childGap(k, taxYear, joint) !== 'kinder') return []
  const fields: ChildGapField[] = []
  if (!k.taxId) fields.push('taxId')
  if (!k.kinship) fields.push('kinship')
  if (!k.familyBenefitsOffice) fields.push('familyBenefitsOffice')
  if (k.domesticResidenceAllYear == null) fields.push('residence')
  if (needsOtherParent(k, joint) && otherParentGap(k) === 'kinder') fields.push('otherParent')
  return fields
}

/** The months a child counts in the tax year: from its birth when born in it, to the year's end. */
interface ChildYear {
  readonly taxYear: number
  readonly start: string
  readonly end: string
}

function childYear(k: ChildFacts, taxYear: number): ChildYear {
  return { taxYear, start: k.geburtsdatum?.startsWith(`${taxYear}-`) ? k.geburtsdatum : `${taxYear}-01-01`, end: `${taxYear}-12-31` }
}

/** Zeile 4 ff.: the child's identity, the Kindergeld (with the Swiss differential) and the Familienkasse. */
function identityFields(k: ChildFacts, parentLastName: string | null, taxYear: number): Fields {
  const kValues: Fields = {}
  if (k.taxId) kValues['anlKind.idnr'] = k.taxId
  if (k.firstName) kValues['anlKind.vorname'] = k.firstName
  if (k.lastName && k.lastName !== parentLastName) kValues['anlKind.nachname'] = k.lastName
  if (k.geburtsdatum) kValues['anlKind.geburtsdatum'] = formatGermanDate(k.geburtsdatum)
  if (k.swissFamilyAllowanceEur && Number(k.swissFamilyAllowanceEur) > 0) {
    const swissEur = Number(k.swissFamilyAllowanceEur)
    const diff = calculateDifferentialChildBenefit(k.geburtsdatum ?? `${taxYear}-01-01`, taxYear, swissEur)
    const claimEur = k.childBenefitClaimEur ? Number(k.childBenefitClaimEur) : 0
    kValues['anlKind.kindergeld'] = String(Math.max(claimEur, diff.totalClaim))
  } else if (k.childBenefitClaimEur) {
    kValues['anlKind.kindergeld'] = k.childBenefitClaimEur
  }
  if (k.familyBenefitsOffice) kValues['anlKind.familienkasse'] = k.familyBenefitsOffice
  return kValues
}

/** Zeilen 27/28 and 67: the child's insurance the parents pay as policyholders, and childcare. */
function costFields(k: ChildFacts): Fields {
  const kValues: Fields = {}
  // An empty or zero line stays empty. A foreign insurer (e.g. Swiss basic insurance) goes into Kz 89,
  // KV and PV together (ADR-0090).
  const foreignHealthEur = k.healthInsuranceAbroad === true ? Number(k.healthBasicEur ?? 0) + Number(k.careEur ?? 0) : 0
  if (foreignHealthEur > 0) kValues['anlKind.kz89'] = String(foreignHealthEur)
  else if (k.healthBasicEur && Number(k.healthBasicEur) > 0) kValues['anlKind.kz66'] = k.healthBasicEur
  // Zeile 67: what the parents paid; the tax office applies the 80 % and the cap itself.
  if (k.childcareEur && Number(k.childcareEur) > 0) {
    kValues['anlKind.kz51'] = k.childcareEur
    if (k.childcareProvider) kValues['anlKind.z67Text'] = k.childcareProvider
    if (k.childcareFrom) kValues['anlKind.z67Von'] = k.childcareFrom
    if (k.childcareTo) kValues['anlKind.z67Bis'] = k.childcareTo
  }
  if (k.healthInsuranceAbroad !== true && k.careEur && Number(k.careEur) > 0) kValues['anlKind.kz67'] = k.careEur
  return kValues
}

/** Zeilen 33–49: residence, kinship, and for a single parent the Entlastungsbetrag (Kz 42–49). */
function householdFields(k: ChildFacts, year: ChildYear, joint: boolean, singleParent: boolean): Fields {
  const kValues: Fields = {}
  if (k.domesticResidenceAllYear) {
    kValues['anlKind.inlandVon'] = formatGermanDate(year.start)
    kValues['anlKind.inlandBis'] = formatGermanDate(year.end)
  }
  if (k.kinship) kValues['anlKind.kz02'] = k.kinship
  if (joint && k.kinshipB) kValues['anlKind.kz03'] = k.kinshipB
  if (singleParent && k.registeredWithMeAllYear && k.childBenefitToMeAllYear) {
    kValues['anlKind.kz42Von'] = formatGermanDate(year.start)
    kValues['anlKind.kz42Bis'] = formatGermanDate(year.end)
    kValues['anlKind.kz44Von'] = formatGermanDate(year.start)
    kValues['anlKind.kz44Bis'] = formatGermanDate(year.end)
    kValues['anlKind.kz46'] = '2'
    kValues['anlKind.kz49'] = '2'
  }
  return kValues
}

/** Zeilen 16–18: the other parent when it is not the spouse of a joint return. */
function otherParentFields(k: ChildFacts, year: ChildYear, joint: boolean): Fields {
  const kValues: Fields = {}
  if (!needsOtherParent(k, joint)) return kValues
  if (k.otherParent === 'Unbekannt') kValues['anlKind.kz05'] = '1'
  if (k.otherParent !== 'Inland' && k.otherParent !== 'Verstorben') return kValues
  if (k.otherParentName) kValues['anlKind.aeName'] = k.otherParentName
  if (k.otherParentBirthDate) kValues['anlKind.aeGeburtsdatum'] = formatGermanDate(k.otherParentBirthDate)
  if (k.otherParentAddress) kValues['anlKind.aeAdresse'] = k.otherParentAddress
  if (k.otherParentKind) kValues['anlKind.aeArt'] = k.otherParentKind
  const tod = k.otherParent === 'Verstorben' ? k.otherParentDiedOn : null
  if (tod) kValues['anlKind.kz06'] = formatGermanDate(tod)
  const to = tod && tod < year.end ? tod : year.end
  if (to >= year.start) {
    kValues['anlKind.aeVon'] = formatGermanDate(year.start)
    kValues['anlKind.aeBis'] = formatGermanDate(to)
  }
  return kValues
}

/** One Anlage Kind. */
export function anlageKindValues(k: ChildFacts, index: number, facts: PrintoutFacts, singleParent: boolean): Fields {
  const { profile, taxYear } = facts
  const joint = isJoint(facts)
  const year = childYear(k, taxYear)
  return {
    ...formHeader('anlKind', profile, profile.steuernummer, 'vornameEltern'),
    'anlKind.lfdNr': k.sequenceNumber ?? String(index + 1),
    ...identityFields(k, profile.lastName, taxYear),
    ...costFields(k),
    ...householdFields(k, year, joint, singleParent),
    ...otherParentFields(k, year, joint),
  }
}

/** A single parent without another adult in the household (Zeilen 47/48 both „Nein“). */
function isSingleParent(facts: PrintoutFacts): boolean {
  return (
    !isJoint(facts) &&
    facts.masterData?.familienstand !== 'verheiratet' &&
    facts.singleParent?.otherPerson === 'Nein' &&
    facts.singleParent.householdCommunity === 'Nein'
  )
}

export function childrenSection(facts: PrintoutFacts): Section {
  const kinder = facts.kinder
  if (!kinder || kinder.length === 0) return {}
  const joint = isJoint(facts)
  const single = isSingleParent(facts)
  const missing: string[] = []
  const childFields: ChildGapField[] = []
  for (const kind of kinder) {
    const missingField = childGap(kind, facts.taxYear, joint)
    if (missingField && !missing.includes(missingField)) missing.push(missingField)
    childFields.push(...childGapFields(kind, facts.taxYear, joint))
  }
  return { instances: { 'anlage-kind': kinder.map((k, i) => anlageKindValues(k, i, facts, single)) }, missing, childFields }
}

/** Children named on the basis page but none recorded: the Anlage Kind would be missing (Strom-vs-chat, P2). */
export function childrenNamedSection(facts: PrintoutFacts): Section {
  if (!facts.childrenAnswered || (facts.kinder?.length ?? 0) > 0) return {}
  return { missing: ['kinder'], childFields: ['child'] }
}
