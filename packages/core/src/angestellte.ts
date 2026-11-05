import type { Answers } from './interview'
import { gatedIncomeTypes, type IncomeType } from './einkunftsarten'
import { wageTaxCertificateStatus, type WageTaxCertificateData } from './lstb'
import { deductibleBasicProvision, healthInsuranceFromAnswers } from './krankenversicherung'

/** The interview-catalogue-derived figures for the Angestellte case, already categorised into where they belong in the fold. */
export interface EmployeeAnswerFigures {
  readonly sideJobGross: number
  readonly relocationCosts: number
  readonly donations: number
  readonly healthCareContributions: number
  readonly riester: number
  readonly doubleHouseholdRent: number
  readonly severanceAmount: number
  readonly wageReplacementAmount: number
}

function intAus(value: string | undefined): number {
  if (value === undefined) return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export function employeeFromAnswers(answers: Answers): EmployeeAnswerFigures {
  const nebenjob = answers.nebenjob === 'Midijob' || answers.nebenjob === 'Nebenjob' ? intAus(answers['nebenjob-brutto']) : 0
  return {
    sideJobGross: nebenjob,
    relocationCosts: answers.umzug === 'Ja' ? intAus(answers['umzug-kosten']) : 0,
    donations: answers.spenden === 'Ja' ? intAus(answers['spenden-betrag']) : 0,
    healthCareContributions: deductibleBasicProvision(healthInsuranceFromAnswers(answers)),
    riester: answers.riester === 'Ja' ? intAus(answers['riester-betrag']) : 0,
    doubleHouseholdRent: answers.dhf === 'Ja' ? intAus(answers['dhf-miete']) : 0,
    severanceAmount: answers.abfindung === 'Ja' ? intAus(answers['abfindung-betrag']) : 0,
    wageReplacementAmount: answers.lohnersatz === 'Ja' ? intAus(answers['lohnersatz-betrag']) : 0,
  }
}

export interface EmployeeInputs {
  readonly income: number
  readonly incomeRelatedExpenses: number
  readonly specialExpenses: number
  readonly openItems: number
  readonly conflicts: number
  readonly gated: readonly IncomeType[]
}

export type AngestelltenStand =
  | { readonly kind: 'bestimmt'; readonly einnahmen: number; readonly werbungskosten: number; readonly sonderausgaben: number; readonly einkuenfte: number }
  | {
      readonly kind: 'offen'
      readonly einnahmen: number
      readonly werbungskosten: number
      readonly sonderausgaben: number
      readonly einkuenfte: number
      readonly offenePosten: number
      readonly konflikte: number
      readonly gegated: readonly IncomeType[]
    }

function validate(eingaben: EmployeeInputs): void {
  for (const [name, n] of [
    ['einnahmen', eingaben.income],
    ['werbungskosten', eingaben.incomeRelatedExpenses],
    ['sonderausgaben', eingaben.specialExpenses],
    ['offenePosten', eingaben.openItems],
    ['konflikte', eingaben.conflicts],
  ] as const) {
    if (!Number.isInteger(n) || n < 0) throw new RangeError(`${name} must be a non-negative integer`)
  }
}

export function calculateEmployeeStatus(eingaben: EmployeeInputs): AngestelltenStand {
  validate(eingaben)
  const einkuenfte = Math.max(0, eingaben.income - eingaben.incomeRelatedExpenses)
  const offen = eingaben.openItems > 0 || eingaben.conflicts > 0 || eingaben.gated.length > 0
  if (!offen) {
    return {
      kind: 'bestimmt',
      einnahmen: eingaben.income,
      werbungskosten: eingaben.incomeRelatedExpenses,
      sonderausgaben: eingaben.specialExpenses,
      einkuenfte,
    }
  }
  return {
    kind: 'offen',
    einnahmen: eingaben.income,
    werbungskosten: eingaben.incomeRelatedExpenses,
    sonderausgaben: eingaben.specialExpenses,
    einkuenfte,
    offenePosten: eingaben.openItems,
    konflikte: eingaben.conflicts,
    gegated: eingaben.gated,
  }
}

/** The ONE fold from the readable Angestellte facts → every numeric input both the Cockpit spanne AND the Plausibilitäts-Prüfung need. */
export interface AngestellteFakten {
  readonly einnahmen: number
  readonly werbungskosten: number
  readonly sonderausgaben: number
  readonly offenePosten: number
  readonly konflikte: number
  readonly gegated: readonly IncomeType[]
  readonly erfasstNichtGerechnet: number
}

export function employeeFromData(daten: WageTaxCertificateData, answers: Answers): AngestellteFakten {
  const zahlen = employeeFromAnswers(answers)
  const zustand = wageTaxCertificateStatus(daten)
  const angestellt = answers.job === 'Angestellt' || answers.job === 'Beides'

  const einnahmen =
    (angestellt && daten.bruttoarbeitslohn.kind === 'erfasst' ? daten.bruttoarbeitslohn.wert : 0) + zahlen.sideJobGross

  const offeneLstb =
    angestellt && zustand.kind === 'unvollstaendig' ? zustand.offen.length + zustand.unklar.length : 0
  const nebenjobOffen =
    (answers.nebenjob === 'Midijob' || answers.nebenjob === 'Nebenjob') && zahlen.sideJobGross === 0
  const offenePosten = offeneLstb + (nebenjobOffen ? 1 : 0)

  return {
    einnahmen,
    werbungskosten: zahlen.relocationCosts,
    sonderausgaben: zahlen.donations + zahlen.healthCareContributions + zahlen.riester,
    offenePosten,
    konflikte: angestellt && zustand.kind === 'widerspruch' ? zustand.widersprueche.length : 0,
    gegated: gatedIncomeTypes(answers),
    erfasstNichtGerechnet: zahlen.doubleHouseholdRent + zahlen.severanceAmount + zahlen.wageReplacementAmount,
  }
}
