import type { CaseDigest } from './advisor'

/**
 * Work the owl does on her own initiative instead of answering one question (#501): the savings
 * plan goes through every lever against the whole case, the assessment check compares the tax
 * office's notice with the return. Both are started with a quick action.
 */
export const ADVISOR_TASKS = ['savings-plan', 'assessment-check', 'opening'] as const
export type AdvisorTask = (typeof ADVISOR_TASKS)[number]

/** A way to save tax that the case, as far as the app can see, does not use yet. */
export interface SavingsLever {
  readonly id: string
  readonly label: string
  /** `unused`: the app sees the field empty. `unknown`: the app has no field for it, the owl has to ask. */
  readonly state: 'unused' | 'unknown'
}

/**
 * What the case does not use yet, read off the digest without a model. The list is what the
 * savings plan works through, so that no lever depends on the model remembering it.
 */
export function unusedSavingsLevers(digest: CaseDigest): readonly SavingsLever[] {
  const levers: SavingsLever[] = []
  const add = (id: string, label: string, state: SavingsLever['state'] = 'unused') => levers.push({ id, label, state })
  const { commuteAndWorkdays: work, catalogExpenses: costs } = digest

  if (work.distanceKm === null || work.workdays === null) add('arbeitsweg', 'Arbeitsweg: Entfernung oder Arbeitstage fehlen')
  if (work.homeOfficeDays === null || work.homeOfficeDays === 0) add('homeoffice', 'Homeoffice-Tagespauschale: keine Tage angegeben')
  if (!costs.hasTraining) add('fortbildung', 'Fortbildung: nichts angegeben')
  else if (costs.trainingCostsEur === null || costs.trainingCostsEur === undefined) add('fortbildung-betrag', 'Fortbildung: Kosten fehlen')
  if (costs.donationsEur === null) add('spenden', 'Spenden: nichts angegeben')
  if (costs.selfPaidKvPvEur === null) add('vorsorge', 'Selbst gezahlte Kranken- und Pflegeversicherung: nichts angegeben')
  if (costs.riesterEur === null) add('riester', 'Riester oder Basisrente: nichts angegeben')
  if (costs.relocationCostsEur === null) add('umzug', 'Beruflicher Umzug: nichts angegeben')
  if (costs.doubleHouseholdRentEur === null) add('doppelte-haushaltsfuehrung', 'Doppelte Haushaltsführung: nichts angegeben')
  if (digest.capitalGainEur === null) add('kapital', 'Kapitalerträge: nichts angegeben (Freistellungsauftrag, Günstigerprüfung, Verluste)')
  if (digest.childrenCount > 0) add('kinder', 'Kinder: Betreuungskosten, Schulgeld, Günstigerprüfung, Entlastungsbetrag', 'unknown')
  if (digest.filingStatus === 'zusammen') add('veranlagungsart', 'Veranlagungsart: Zusammen- gegen Einzelveranlagung rechnen', 'unknown')
  if (digest.crossBorder.isCrossBorderCh) add('grenzgaenger', 'Grenzgänger: Quellensteuer, AHV, Pensionskasse, Krankenversicherung', 'unknown')
  if (digest.rentalObjectsCount > 0) add('vermietung', 'Vermietung: AfA, Erhaltungsaufwand verteilen, alle Werbungskosten', 'unknown')

  const further = digest.furtherFacts
  if (!further || further.householdServicesEur === null) add('haushaltsnah', 'Handwerker und haushaltsnahe Dienste (§ 35a), auch aus der Nebenkostenabrechnung: nichts angegeben')
  if (!further || further.healthCostsEur === null) add('gesundheit', 'Krankheitskosten: nichts angegeben')
  if (further && further.wageReplacementEur !== null && further.wageReplacementEur > 0) add('progressionsvorbehalt', 'Lohnersatz unter Progressionsvorbehalt: Nachzahlung möglich, bei Ehegatten Einzelveranlagung prüfen', 'unknown')

  // The app has no field for these: the owl has to ask.
  add('arbeitsmittel', 'Arbeitsmittel, Telefon und Internet, Kontoführung, Gewerkschaft', 'unknown')
  add('pflege-behinderung', 'Pflege, Behinderung (Pauschbeträge)', 'unknown')
  add('vorjahre', 'Offene Vorjahre: freiwillige Erklärung bis vier Jahre zurück', 'unknown')
  return levers
}

/** What the tax office's notice says against the return, without anything that names a person. */
export interface AdvisorAssessmentBrief {
  /** False while the user has not entered the notice. */
  readonly recorded: boolean
  readonly status: string
  readonly deviations: readonly { readonly field: string; readonly assessedEur: number; readonly calculatedEur: number; readonly differenceEur: number }[]
  /** The comparison is partial because the return is not complete. */
  readonly calculationIncomplete: boolean
  /** Days left for an objection; null without a notice date. */
  readonly appealDaysLeft: number | null
}
