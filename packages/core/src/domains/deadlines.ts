import { isSupportedIncomeTaxYear } from '../math/tarif'
import { getTaxYearParameters } from '../math/tax-parameters'

export const DEADLINE_WARNING_THRESHOLD_DAYS = 60
export const LATE_FILING_FEE_MINIMUM_EUR = 25
export const LATE_FILING_FEE_PERCENT_PER_MONTH = 0.25

export type DeadlineYear = 2022 | 2023 | 2024 | 2025 | 2026

export function isSupportedDeadlineYear(year: number): year is DeadlineYear {
  return isSupportedIncomeTaxYear(year)
}

export function filingDeadlineFor(taxYear: number): string {
  if (!isSupportedIncomeTaxYear(taxYear)) {
    throw new RangeError(`Unsupported tax year for the Abgabefrist / filing deadline (§ 149 Abs. 2 AO): ${taxYear}`)
  }
  return getTaxYearParameters(taxYear).deadlines.standardFilingDeadline
}

/**
 * Gesetzliche Festsetzungsverjährung für die freiwillige Steuererklärung / Antragsveranlagung
 * (§ 169 Abs. 2 Satz 1 Nr. 2 AO: 4 Jahre ab Ablauf des Besteuerungszeitraums).
 */
export function voluntaryFilingDeadlineFor(taxYear: number): string {
  if (!isSupportedIncomeTaxYear(taxYear)) {
    throw new RangeError(`Unsupported tax year for the Festsetzungsverjährung (§ 169 AO): ${taxYear}`)
  }
  return getTaxYearParameters(taxYear).deadlines.voluntaryFilingDeadline
}

/**
 * Prüft, ob ein Steuerjahr für die freiwillige Veranlagung (§ 169 AO) bezogen auf ein Datum bereits verjährt ist.
 */
export function isFestsetzungsverjaehrt(taxYear: number, today: string): boolean {
  const voluntaryDeadline = voluntaryFilingDeadlineFor(taxYear)
  return daysSince(voluntaryDeadline) - daysSince(today) < 0
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function daysSince(iso: string): number {
  const m = ISO_DATE_RE.exec(iso)
  if (m === null) throw new RangeError(`"${iso}" is not an ISO yyyy-mm-dd date`)
  return Date.UTC(Number(m[1]!), Number(m[2]!) - 1, Number(m[3]!)) / 86_400_000
}

export type DeadlineLevel = 'keine' | 'warnung' | 'abgelaufen'

export interface DeadlineWarning {
  readonly level: DeadlineLevel
  readonly filingDeadline: string
  readonly remainingDays: number
}

export function deadlineWarning(taxYear: number, today: string): DeadlineWarning {
  const filingDeadline = filingDeadlineFor(taxYear)
  const remainingDays = daysSince(filingDeadline) - daysSince(today)
  const level: DeadlineLevel = remainingDays < 0 ? 'abgelaufen' : remainingDays <= DEADLINE_WARNING_THRESHOLD_DAYS ? 'warnung' : 'keine'
  return { level, filingDeadline, remainingDays }
}
