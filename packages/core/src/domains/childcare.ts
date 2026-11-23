import { ageAtEndOfYear } from '../common/dates'
import { CHILDCARE_DEDUCTION_STEPS, valueForYear } from '../math/tax-parameters'

/**
 * Kinderbetreuungskosten as Sonderausgaben (§ 10 Abs. 1 Nr. 5 EStG), per child (ADR-0076): from 2025
 * 80 % of what the parents paid, at most 4.800 €; before 2025 two thirds, at most 4.000 €. Only for a
 * child that has not turned 14 by the start of the year (a disabled child is beyond this rule here).
 */
export function childcareDeductionEur(year: number, paidEur: number | null | undefined, birthDate?: string | null): number {
  if (!paidEur || paidEur <= 0) return 0
  if (birthDate && (ageAtEndOfYear(birthDate, year) ?? 0) > 14) return 0
  const { share, capEur } = valueForYear(CHILDCARE_DEDUCTION_STEPS, year)
  return Math.min(Math.round(paidEur * share), capEur)
}
