import type { CalculationTermDto } from '@steuereule/api-client'

const EURO = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })

/**
 * Renders the summands of a scanned LStB value, e.g. „Zeile 23a (5.051,76 €) + Zeile 25 (4.182,64 €)“.
 * `formatTerm` supplies the translated wording of one summand.
 */
export function formatCalculation(
  terms: readonly CalculationTermDto[],
  formatTerm: (line: string, amount: string) => string,
): string | null {
  if (terms.length === 0) return null
  return terms.map((term) => formatTerm(term.line, EURO.format(term.amount))).join(' + ')
}
