export const DEADLINE_WARNING_THRESHOLD_DAYS = 60
export const LATE_FILING_FEE_MINIMUM_EUR = 25
export const LATE_FILING_FEE_PERCENT_PER_MONTH = 0.25
const FILING_DEADLINES: Readonly<Record<number, string>> = {
  2024: '2025-07-31',
  2025: '2026-07-31',
  2026: '2027-07-31',
}

export type DeadlineYear = 2024 | 2025 | 2026

export function isSupportedDeadlineYear(year: number): year is DeadlineYear {
  return Number.isInteger(year) && Object.prototype.hasOwnProperty.call(FILING_DEADLINES, year)
}

export function filingDeadlineFor(taxYear: number): string {
  if (!isSupportedDeadlineYear(taxYear)) {
    throw new RangeError(`Unsupported tax year for the Abgabefrist / filing deadline (§ 149 Abs. 2 AO): ${taxYear}`)
  }
  return FILING_DEADLINES[taxYear]!
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function daysSince(iso: string): number {
  const m = ISO_DATE_RE.exec(iso)
  if (m === null) throw new RangeError(`"${iso}" is not an ISO yyyy-mm-dd date`)
  return Date.UTC(Number(m[1]!), Number(m[2]!) - 1, Number(m[3]!)) / 86_400_000
}

export type DeadlineLevel = 'none' | 'warning' | 'expired'
export type FristenStufe = 'keine' | 'warnung' | 'abgelaufen'

export interface DeadlineWarning {
  readonly level: DeadlineLevel
  readonly filingDeadline: string
  readonly remainingDays: number
}

export interface FristenWarnung {
  readonly stufe: FristenStufe
  readonly abgabefrist: string
  readonly verbleibendeTage: number
}

export function deadlineWarning(taxYear: number, today: string): DeadlineWarning {
  const filingDeadline = filingDeadlineFor(taxYear)
  const remainingDays = daysSince(filingDeadline) - daysSince(today)
  const level: DeadlineLevel = remainingDays < 0 ? 'expired' : remainingDays <= DEADLINE_WARNING_THRESHOLD_DAYS ? 'warning' : 'none'
  return { level, filingDeadline, remainingDays }
}

export function fristenWarnung(steuerjahr: number, heute: string): FristenWarnung {
  const abgabefrist = filingDeadlineFor(steuerjahr)
  const verbleibendeTage = daysSince(abgabefrist) - daysSince(heute)
  const stufe: FristenStufe = verbleibendeTage < 0 ? 'abgelaufen' : verbleibendeTage <= DEADLINE_WARNING_THRESHOLD_DAYS ? 'warnung' : 'keine'
  return { stufe, abgabefrist, verbleibendeTage }
}
