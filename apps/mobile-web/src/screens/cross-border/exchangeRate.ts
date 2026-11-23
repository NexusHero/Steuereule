/** The exchange rate is the official rate of one month of the tax year, or the annual average — picked, not typed. */
export const MONTH_NUMBERS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'] as const

/** A rate as typed in the field: decimal comma instead of point. */
export function rateText(rate: number): string {
  return String(rate).replace('.', ',')
}

/** The euros one hundred francs are worth at the rate, with two decimals and a decimal comma. */
export function eurPerHundredChf(rate: number): string {
  return (rate * 100).toFixed(2).replace('.', ',')
}

/** The short month name of a month chip, in the UI language. */
export function monthLabel(taxYear: number, monthNumber: string, language: string): string {
  return new Date(Date.UTC(taxYear, Number(monthNumber) - 1, 1)).toLocaleString(language, { month: 'short', timeZone: 'UTC' })
}

/** The rate to save, or null when the month or the rate is not valid. The tax year itself stands for the annual average. */
export function exchangeRateToSave(
  month: string,
  rate: string,
  taxYear: number,
): { readonly month: string; readonly rate: number; readonly mode: 'jahresdurchschnitt' | 'amtlich' } | null {
  const n = Number(rate.trim().replace(',', '.'))
  const annual = month === String(taxYear)
  const valid = (annual || /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) && Number.isFinite(n) && n > 0
  return valid ? { month, rate: n, mode: annual ? 'jahresdurchschnitt' : 'amtlich' } : null
}
