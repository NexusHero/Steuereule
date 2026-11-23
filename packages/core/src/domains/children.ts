import { isValidDate } from '../common/master-data'
import { isSupportedIncomeTaxYear } from '../math/tarif'
import { getTaxYearParameters, CHILD_ALLOWANCE_FALLBACK_STEPS, CHILD_BENEFIT_FALLBACK_STEPS, valueForYear } from '../math/tax-parameters'

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
  if (isSupportedIncomeTaxYear(year)) {
    return getTaxYearParameters(year).children.childAllowanceTotalEur
  }
  const bea = 2928
  return valueForYear(CHILD_ALLOWANCE_FALLBACK_STEPS, year) + bea
}

export function monthlyChildBenefitClaim(year: number): number {
  if (isSupportedIncomeTaxYear(year)) {
    return getTaxYearParameters(year).children.monthlyBenefitEur
  }
  return valueForYear(CHILD_BENEFIT_FALLBACK_STEPS, year)
}

export function claimMonths(birthDate: string, year: number): number {
  const [birthYear, month] = birthDate.split('-').map(Number)
  if (birthYear! < year) return 12
  if (birthYear! > year) return 0
  return 13 - month!
}

/**
 * The Kindergeld that the Günstigerprüfung sets against the Kinderfreibetrag (§ 31 Satz 4 EStG):
 * the claim for the months of the year, not what was paid out. A Swiss Kinderzulage counts as
 * Kindergeld (§ 65 EStG) and the German Differenzkindergeld tops it up, so together they are this
 * same claim; where the foreign benefit is higher, the offset still stops at the German amount
 * (§ 31 Satz 6 EStG). The estimate adds exactly this (`monthlyChildBenefitClaim × claimMonths`).
 */
export function childBenefitForComparison(birthDate: string, year: number): number {
  return monthlyChildBenefitClaim(year) * claimMonths(birthDate, year)
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
