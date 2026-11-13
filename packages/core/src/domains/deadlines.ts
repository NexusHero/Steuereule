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
  const threshold = isSupportedIncomeTaxYear(taxYear) ? getTaxYearParameters(taxYear).deadlines.warningThresholdDays : DEADLINE_WARNING_THRESHOLD_DAYS
  const level: DeadlineLevel = remainingDays < 0 ? 'abgelaufen' : remainingDays <= threshold ? 'warnung' : 'keine'
  return { level, filingDeadline, remainingDays }
}

export interface TaxDate {
  /** ISO date. */
  readonly date: string
  readonly label: string
}

/** How far ahead the owl is told about dates. */
export const TAX_DATES_AHEAD_DAYS = 90

const dayNumber = (iso: string): number => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000

/**
 * Dates in the coming 90 days that can save or cost the user money, for the tax year in view and
 * the calendar year running. Fixed dates of the law and of practice only; nothing about the
 * user's case is assumed (whether there are prepayments, a second bank, …).
 */
export function upcomingTaxDates(taxYear: number, today: string): readonly TaxDate[] {
  const year = Number(today.slice(0, 4))
  const dates: TaxDate[] = []
  for (const calendarYear of [year, year + 1]) {
    for (const month of ['03', '06', '09', '12']) {
      dates.push({ date: `${calendarYear}-${month}-10`, label: 'Einkommensteuer-Vorauszahlung fällig, falls festgesetzt (§ 37 EStG); bei sinkendem Einkommen Herabsetzung beantragen' })
    }
    dates.push({ date: `${calendarYear}-12-15`, label: 'Verlustbescheinigung bei der Bank beantragen, um Verluste mit Gewinnen bei einer anderen Bank zu verrechnen (§ 43a Abs. 3 EStG)' })
    dates.push({ date: `${calendarYear}-12-31`, label: `Letzter Tag für Zahlungen, die noch für ${calendarYear} zählen (§ 11 EStG): Handwerker, Spenden, Arbeitsmittel, Fortbildung` })
  }
  if (isSupportedIncomeTaxYear(taxYear)) {
    dates.push({ date: filingDeadlineFor(taxYear), label: `Abgabefrist der Erklärung ${taxYear}, wenn sie Pflicht ist (ohne Steuerberater)` })
    dates.push({ date: voluntaryFilingDeadlineFor(taxYear), label: `Letzter Tag für eine freiwillige Erklärung ${taxYear} (§ 169 AO)` })
  }
  const from = dayNumber(today)
  return dates
    .filter((entry) => dayNumber(entry.date) >= from && dayNumber(entry.date) - from <= TAX_DATES_AHEAD_DAYS)
    .sort((a, b) => a.date.localeCompare(b.date))
}
