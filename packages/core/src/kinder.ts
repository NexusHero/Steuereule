import { isValidDate } from './stammdaten'

export const CHILD_RELATIONSHIPS = ['1', '2', '3'] as const
export type ChildRelationship = (typeof CHILD_RELATIONSHIPS)[number]
export type Kindschaftsverhaeltnis = ChildRelationship
export const KINDSCHAFTSVERHAELTNISSE = CHILD_RELATIONSHIPS

export const OTHER_CHILD_RELATIONSHIPS = ['1', '2'] as const
export const ANDERE_KINDSCHAFTSVERHAELTNISSE = OTHER_CHILD_RELATIONSHIPS

export const OTHER_PARENT_STATUSES = ['Inland', 'Ausland', 'Verstorben', 'Unbekannt'] as const
export type OtherParentStatus = (typeof OTHER_PARENT_STATUSES)[number]
export type AndererElternteilStatus = OtherParentStatus
export const ANDERER_ELTERNTEIL_STATUS = OTHER_PARENT_STATUSES

export interface ChildData {
  readonly id: string
  readonly firstName: string
  readonly lastName: string
  readonly birthDate: string
  readonly taxId: string | null
  readonly childBenefit: number | null
}

export interface KindDaten {
  readonly id: string
  readonly vorname: string
  readonly nachname: string
  readonly geburtsdatum: string
  readonly steuerId: string | null
  readonly kindergeld: number | null
}

export function isValidChildBirthDate(date: string, taxYear: number): boolean {
  if (!isValidDate(date)) return false
  const year = Number(date.split('-')[0])
  return !Number.isNaN(year) && year <= taxYear
}

export function childTaxAllowance(year: number): number {
  const bea = 2928
  if (year <= 2023) return 6024 + bea
  if (year === 2024) return 6612 + bea
  if (year === 2025) return 6672 + bea
  return 6828 + bea
}

export function monthlyChildBenefitClaim(year: number): number {
  if (year <= 2022) return 219
  if (year <= 2024) return 250
  if (year === 2025) return 255
  return 259
}

export function claimMonths(birthDate: string, year: number): number {
  const [birthYear, month] = birthDate.split('-').map(Number)
  if (birthYear! < year) return 12
  if (birthYear! > year) return 0
  return 13 - month!
}

export interface ChildrenStatus {
  readonly count: number
  readonly childBenefitSum: number
  readonly totalAllowance: number
}

export interface KinderStand {
  readonly anzahl: number
  readonly kindergeldSumme: number
  readonly freibetragGesamt: number
}

export function calculateChildrenStatus(children: readonly (ChildData | KindDaten)[], year: number): KinderStand & ChildrenStatus {
  let childBenefitSum = 0
  let totalAllowance = 0
  for (const k of children) {
    const birthDate = 'birthDate' in k ? k.birthDate : k.geburtsdatum
    const benefit = 'childBenefit' in k ? k.childBenefit : k.kindergeld
    const months = claimMonths(birthDate, year)
    childBenefitSum += benefit ?? monthlyChildBenefitClaim(year) * months
    totalAllowance += Math.round((childTaxAllowance(year) * months) / 12)
  }
  return {
    anzahl: children.length,
    kindergeldSumme: childBenefitSum,
    freibetragGesamt: totalAllowance,
    count: children.length,
    childBenefitSum,
    totalAllowance,
  }
}

// Backward-compatibility aliases
export {
  isValidChildBirthDate as istGueltigesKindGeburtsdatum,
  childTaxAllowance as kinderfreibetrag,
  monthlyChildBenefitClaim as kindergeldAnspruchMonat,
  claimMonths as anspruchsMonate,
  calculateChildrenStatus as kinderStand,
}
