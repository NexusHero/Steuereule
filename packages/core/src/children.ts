import { isValidDate } from './master-data'

export const CHILD_RELATIONSHIPS = ['1', '2', '3'] as const
export type ChildRelationship = (typeof CHILD_RELATIONSHIPS)[number]
export const OTHER_CHILD_RELATIONSHIPS = ['1', '2'] as const
export const OTHER_PARENT_STATUSES = ['Inland', 'Ausland', 'Verstorben', 'Unbekannt'] as const
export type OtherParentStatus = (typeof OTHER_PARENT_STATUSES)[number]

export interface ChildData {
  readonly id: string
  readonly firstName: string
  readonly lastName: string
  readonly birthDate: string
  readonly taxId: string | null
  readonly childBenefit: number | null
  readonly swissFamilyAllowanceEur?: number | null
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

export interface DifferentialChildBenefitResult {
  readonly statutoryClaim: number
  readonly swissAllowanceEur: number
  readonly differentialChildBenefit: number
  readonly totalClaim: number
}

export function calculateDifferentialChildBenefit(
  birthDate: string,
  taxYear: number,
  swissAllowanceEur: number,
): DifferentialChildBenefitResult {
  if (!Number.isFinite(swissAllowanceEur) || swissAllowanceEur < 0) {
    throw new RangeError('swissAllowanceEur must be a non-negative finite number')
  }
  const months = claimMonths(birthDate, taxYear)
  const statutoryClaim = monthlyChildBenefitClaim(taxYear) * months
  const differentialChildBenefit = Math.max(0, statutoryClaim - swissAllowanceEur)
  const totalClaim = Math.max(statutoryClaim, swissAllowanceEur)
  return {
    statutoryClaim,
    swissAllowanceEur,
    differentialChildBenefit,
    totalClaim,
  }
}

export interface ChildrenStatus {
  readonly count: number
  readonly childBenefitSum: number
  readonly totalAllowance: number
  readonly swissFamilyAllowanceSum: number
  readonly differentialChildBenefitSum: number
}

export function calculateChildrenStatus(children: readonly ChildData[], year: number): ChildrenStatus {
  let childBenefitSum = 0
  let totalAllowance = 0
  let swissFamilyAllowanceSum = 0
  let differentialChildBenefitSum = 0

  for (const k of children) {
    const { birthDate, childBenefit: benefit, swissFamilyAllowanceEur: swissAllowance } = k
    const months = claimMonths(birthDate, year)
    const statutory = monthlyChildBenefitClaim(year) * months

    if (swissAllowance != null && Number.isFinite(swissAllowance) && swissAllowance > 0) {
      const diff = Math.max(0, statutory - swissAllowance)
      const total = Math.max(statutory, swissAllowance)
      swissFamilyAllowanceSum += swissAllowance
      differentialChildBenefitSum += diff
      childBenefitSum += benefit ?? total
    } else {
      childBenefitSum += benefit ?? statutory
    }

    totalAllowance += Math.round((childTaxAllowance(year) * months) / 12)
  }

  return {
    count: children.length,
    childBenefitSum,
    totalAllowance,
    swissFamilyAllowanceSum,
    differentialChildBenefitSum,
  }
}
