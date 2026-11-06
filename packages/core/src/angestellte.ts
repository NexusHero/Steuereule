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

function intFrom(value: string | undefined): number {
  if (value === undefined) return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export function employeeFromAnswers(answers: Answers): EmployeeAnswerFigures {
  const sideJob = answers.nebenjob === 'Midijob' || answers.nebenjob === 'Nebenjob' ? intFrom(answers['nebenjob-brutto']) : 0
  return {
    sideJobGross: sideJob,
    relocationCosts: answers.umzug === 'Ja' ? intFrom(answers['umzug-kosten']) : 0,
    donations: answers.spenden === 'Ja' ? intFrom(answers['spenden-betrag']) : 0,
    healthCareContributions: deductibleBasicProvision(healthInsuranceFromAnswers(answers)),
    riester: answers.riester === 'Ja' ? intFrom(answers['riester-betrag']) : 0,
    doubleHouseholdRent: answers.dhf === 'Ja' ? intFrom(answers['dhf-miete']) : 0,
    severanceAmount: answers.abfindung === 'Ja' ? intFrom(answers['abfindung-betrag']) : 0,
    wageReplacementAmount: answers.lohnersatz === 'Ja' ? intFrom(answers['lohnersatz-betrag']) : 0,
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

export type EmployeeStatus =
  | { readonly kind: 'bestimmt'; readonly einnahmen: number; readonly werbungskosten: number; readonly specialExpenses: number; readonly netIncome: number }
  | {
      readonly kind: 'offen'
      readonly einnahmen: number
      readonly werbungskosten: number
      readonly specialExpenses: number
      readonly netIncome: number
      readonly openItems: number
      readonly conflicts: number
      readonly gated: readonly IncomeType[]
    }

function validate(inputs: EmployeeInputs): void {
  for (const [name, n] of [
    ['einnahmen', inputs.income],
    ['werbungskosten', inputs.incomeRelatedExpenses],
    ['sonderausgaben', inputs.specialExpenses],
    ['offenePosten', inputs.openItems],
    ['konflikte', inputs.conflicts],
  ] as const) {
    if (!Number.isInteger(n) || n < 0) throw new RangeError(`${name} must be a non-negative integer`)
  }
}

export function calculateEmployeeStatus(inputs: EmployeeInputs): EmployeeStatus {
  validate(inputs)
  const netIncome = Math.max(0, inputs.income - inputs.incomeRelatedExpenses)
  const open = inputs.openItems > 0 || inputs.conflicts > 0 || inputs.gated.length > 0
  if (!open) {
    return {
      kind: 'bestimmt',
      einnahmen: inputs.income,
      werbungskosten: inputs.incomeRelatedExpenses,
      specialExpenses: inputs.specialExpenses,
      netIncome,
    }
  }
  return {
    kind: 'offen',
    einnahmen: inputs.income,
    werbungskosten: inputs.incomeRelatedExpenses,
    specialExpenses: inputs.specialExpenses,
    netIncome,
    openItems: inputs.openItems,
    conflicts: inputs.conflicts,
    gated: inputs.gated,
  }
}

/** The ONE fold from the readable Angestellte facts → every numeric input both the Cockpit spanne AND the Plausibilitäts-Prüfung need. */
export interface EmployeeFacts {
  readonly einnahmen: number
  readonly werbungskosten: number
  readonly specialExpenses: number
  readonly openItems: number
  readonly conflicts: number
  readonly gated: readonly IncomeType[]
  readonly recordedNotCalculated: number
}

export function employeeFromData(data: WageTaxCertificateData, answers: Answers): EmployeeFacts {
  const numbers = employeeFromAnswers(answers)
  const state = wageTaxCertificateStatus(data)
  const employed = answers.job === 'Angestellt' || answers.job === 'Beides'

  const einnahmen =
    (employed && data.bruttoarbeitslohn.kind === 'erfasst' ? data.bruttoarbeitslohn.value : 0) + numbers.sideJobGross

  const openLstb =
    employed && state.kind === 'unvollstaendig' ? state.open.length + state.unclear.length : 0
  const sideJobOpen =
    (answers.nebenjob === 'Midijob' || answers.nebenjob === 'Nebenjob') && numbers.sideJobGross === 0
  const openItems = openLstb + (sideJobOpen ? 1 : 0)

  return {
    einnahmen,
    werbungskosten: numbers.relocationCosts,
    specialExpenses: numbers.donations + numbers.healthCareContributions + numbers.riester,
    openItems,
    conflicts: employed && state.kind === 'widerspruch' ? state.conflicts.length : 0,
    gated: gatedIncomeTypes(answers),
    recordedNotCalculated: numbers.doubleHouseholdRent + numbers.severanceAmount + numbers.wageReplacementAmount,
  }
}
