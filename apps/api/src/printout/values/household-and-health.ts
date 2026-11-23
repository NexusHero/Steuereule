// Anlage Außergewöhnliche Belastungen (medical costs, § 33) and Anlage Haushaltsnahe Aufwendungen (§ 35a), ADR-0077.
import type { PrintoutFacts } from './facts.js'
import { formHeader, type Fields, type Section } from './section.js'

/** Medical costs and what insurers or Beihilfe reimbursed, on their own lines as the form asks (ADR-0090). */
export function extraordinaryBurdensSection({ householdAndHealth: hh, profile }: PrintoutFacts): Section {
  if (!hh?.healthCostsEur) return {}
  return {
    values: {
      ...formHeader('anlAgB', profile, profile.steuernummer),
      'anlAgB.z23Text': 'Krankheitskosten',
      'anlAgB.kz302': String(hh.healthCostsEur),
      'anlAgB.kz303': String(hh.healthReimbursedEur ?? 0),
    },
  }
}

/** Zeilen 4–6: a Minijob in the household, household services and the labour share of craftsmen. */
export function householdServicesSection({ householdAndHealth: hh, profile }: PrintoutFacts): Section {
  if (!hh || !(hh.minijobEur || hh.servicesEur || hh.craftsmenLabourEur)) return {}
  const values: Fields = formHeader('anlHha', profile, profile.steuernummer)
  if (hh.minijobEur) {
    values['anlHha.z4Text'] = 'Haushaltshilfe (Minijob)'
    values['anlHha.kz202'] = String(hh.minijobEur)
  }
  if (hh.servicesEur) {
    values['anlHha.z5Text'] = 'Haushaltsnahe Dienstleistungen'
    values['anlHha.kz212'] = String(hh.servicesEur)
  }
  if (hh.craftsmenLabourEur) {
    // Only the labour share is known; the invoice total stays for the user to add.
    values['anlHha.z6Text'] = 'Handwerkerleistungen'
    values['anlHha.z6Lohn'] = String(hh.craftsmenLabourEur)
    if (hh.craftsmenInvoicesEur) values['anlHha.z6Rechnung'] = String(hh.craftsmenInvoicesEur)
    values['anlHha.kz214'] = String(hh.craftsmenLabourEur)
  }
  return { values }
}
