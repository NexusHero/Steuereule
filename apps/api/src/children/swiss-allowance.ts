import { swissAllowancePerChild } from '@steuereule/core'
import type { CrossBorderSalaryStatementRecord } from '../ch-salary-certificate/ch-salary-certificate.repository.js'
import type { ChildRecord } from './child.repository.js'

/** A parent's Swiss family allowances of the year in EUR (Anlage N-Gre Z. 8 at the Lohnausweis rate). */
export function allowanceTotalEur(record: CrossBorderSalaryStatementRecord | null | undefined): number | null {
  const chf = Number(record?.nGre.familienzulagenChf ?? 0)
  const rate = record?.exchangeRateValue ?? null
  return chf > 0 && rate !== null && rate > 0 ? Math.round(chf * rate) : null
}

/** Each child's Swiss Kinderzulage in EUR: its own amount, or its share of the paying parent's (ADR-0088). */
export function childAllowancesEur(
  children: readonly ChildRecord[],
  a: CrossBorderSalaryStatementRecord | null | undefined,
  b: CrossBorderSalaryStatementRecord | null | undefined,
): (number | null)[] {
  return swissAllowancePerChild(
    children.map((k) => ({ payer: k.swissFamilyAllowancePayer ?? null, ownEur: k.swissFamilyAllowanceEur ? Number(k.swissFamilyAllowanceEur) : null })),
    { A: allowanceTotalEur(a), B: allowanceTotalEur(b) },
  )
}
