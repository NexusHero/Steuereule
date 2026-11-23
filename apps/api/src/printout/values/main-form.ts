// Hauptvordruck ESt 1 A: the filing, the person, the address and the bank, and Zeilen 35/36.
import { formatGermanDate } from '@steuereule/core'
import type { PrintoutFacts } from './facts.js'
import { jointPersonB, type Fields, type Section } from './section.js'

const REQUIRED_MASTER_DATA = ['geburtsdatum', 'strasse', 'hausnummer', 'plz', 'wohnort', 'religion', 'familienstand', 'iban', 'finanzamt'] as const

const SINCE_FIELD: Record<string, string> = {
  verheiratet: 'est1a.verheiratetSeit',
  verwitwet: 'est1a.verwitwetSeit',
  geschieden: 'est1a.geschiedenSeit',
  'dauernd-getrennt': 'est1a.getrenntSeit',
}

const germanDate = (date: string | null | undefined): string | null => (date ? formatGermanDate(date) : null)

function setIfKnown(values: Fields, id: string, value: string | null | undefined): void {
  if (value) values[id] = value
}

/** A married person files jointly or separately; a joint return names Person B on page 1. */
function spouseFields(facts: PrintoutFacts): { values: Fields; missing: string[] } {
  const values: Fields = {}
  const missing: string[] = []
  if (facts.masterData?.familienstand !== 'verheiratet') return { values, missing }
  if (!facts.link) return { values, missing: ['ehegatte'] }
  if (facts.link.filingType === 'einzel') return { values: { 'est1a.einzelveranlagung': true }, missing }
  values['est1a.zusammenveranlagung'] = true
  const b = facts.link.personB
  if (!b || !b.lastName || !b.firstName || !b.steuerId || !b.geburtsdatum) missing.push('personB')
  // What is known of Person B shows in the form view even while a detail is missing, as for
  // Person A; „personB“ keeps the print blocked until all of it is there.
  if (b) {
    setIfKnown(values, 'est1a.idnrB', b.steuerId)
    setIfKnown(values, 'est1a.geburtsdatumB', germanDate(b.geburtsdatum))
    setIfKnown(values, 'est1a.nameB', b.lastName)
    setIfKnown(values, 'est1a.vornameB', b.firstName)
    setIfKnown(values, 'est1a.religionB', b.religion)
    setIfKnown(values, 'est1a.berufB', b.beruf)
  }
  return { values, missing }
}

function identityFields(profile: PrintoutFacts['profile']): Fields {
  const values: Fields = { 'est1a.einkommensteuererklaerung': true }
  setIfKnown(values, 'est1a.steuernummer', profile.steuernummer)
  setIfKnown(values, 'est1a.idnr', profile.steuerId)
  setIfKnown(values, 'est1a.name', profile.lastName)
  setIfKnown(values, 'est1a.vorname', profile.firstName)
  setIfKnown(values, 'est1a.kopfSeite2', [profile.steuernummer, profile.lastName, profile.firstName].filter(Boolean).join(', ') || null)
  return values
}

function masterDataFields(sd: PrintoutFacts['masterData']): Fields {
  const values: Fields = {}
  if (!sd) return values
  // The form line already reads „An das Finanzamt“; the directory's names start with that word.
  setIfKnown(values, 'est1a.finanzamt', sd.finanzamt?.replace(/^Finanzamt\s+(?=\S)/i, ''))
  setIfKnown(values, 'est1a.telefon', sd.telefon)
  setIfKnown(values, 'est1a.geburtsdatum', germanDate(sd.geburtsdatum))
  setIfKnown(values, 'est1a.religion', sd.religion)
  setIfKnown(values, 'est1a.beruf', sd.beruf)
  setIfKnown(values, 'est1a.strasse', sd.strasse)
  setIfKnown(values, 'est1a.hausnummer', sd.hausnummer)
  setIfKnown(values, 'est1a.hausnummerZusatz', sd.hausnummerZusatz)
  setIfKnown(values, 'est1a.plz', sd.plz)
  setIfKnown(values, 'est1a.wohnort', sd.wohnort)
  const sinceField = sd.familienstand ? SINCE_FIELD[sd.familienstand] : undefined
  if (sinceField) setIfKnown(values, sinceField, germanDate(sd.familienstandSeit))
  if (sd.iban?.startsWith('DE')) setIfKnown(values, 'est1a.ibanInland', sd.iban.slice(2))
  else setIfKnown(values, 'est1a.ibanAusland', sd.iban)
  if (sd.kontoinhaber) values['est1a.kontoinhaberName'] = sd.kontoinhaber
  else if (sd.iban) values['est1a.kontoinhaberSelbst'] = true
  return values
}

function identityGaps({ profile, masterData }: PrintoutFacts): string[] {
  const missing: string[] = []
  if (!profile.lastName) missing.push('name')
  if (!profile.firstName) missing.push('vorname')
  if (!profile.steuerId) missing.push('steuerId')
  for (const field of REQUIRED_MASTER_DATA) if (!masterData?.[field]) missing.push(field)
  return missing
}

/** Hauptvordruck pages 1–2: who files, how, where they live and where the refund goes. */
export function mainFormSection(facts: PrintoutFacts): Section {
  const spouse = spouseFields(facts)
  return {
    values: { ...spouse.values, ...identityFields(facts.profile), ...masterDataFields(facts.masterData) },
    missing: [...identityGaps(facts), ...spouse.missing],
  }
}

/**
 * Hauptvordruck Zeilen 35/36, the progression clause (§ 32b EStG): Einkommensersatzleistungen from the
 * life situations (Kz 120 A / 121 B) and the Swiss accident insurance's daily benefit, which left the wage
 * in the Anlage N-Gre (Zeile 10) and is declared as a comparable benefit from Switzerland (Kz 136 A / 137 B).
 */
export function progressionClauseSection(facts: PrintoutFacts, accidentBenefitEur: { readonly A: number | undefined; readonly B: number | undefined }): Section {
  const values: Fields = {}
  const lifeB = jointPersonB(facts)?.lifeSituations
  if (facts.lifeSituations?.wageReplacementEur) values['est1a.kz120'] = String(facts.lifeSituations.wageReplacementEur)
  if (lifeB?.wageReplacementEur) values['est1a.kz121'] = String(lifeB.wageReplacementEur)
  if (accidentBenefitEur.A) values['est1a.kz136'] = String(accidentBenefitEur.A)
  if (accidentBenefitEur.B) values['est1a.kz137'] = String(accidentBenefitEur.B)
  return { values }
}
