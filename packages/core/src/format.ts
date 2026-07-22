// de-DE number/currency formatting — the single formatting source for the whole app
// (design-system rule 10; successor of ui_kits/app/demo-daten.js). A non-breaking space
// (U+00A0) sits between the number and the unit so pills/stickers never wrap at 375px
// (guidelines/qa-checkliste.md). Output is German (the app language); identifiers and messages
// are English (the dev-process language). This module has no customer-facing text.

const LOCALE = 'de-DE'
const NBSP = '\u00A0'

function assertFinite(n: number): void {
  if (!Number.isFinite(n)) {
    throw new RangeError('Value must be a finite number')
  }
}

/** Grouped integer, e.g. 1407 -> "1.407". */
export function formatNumber(n: number): string {
  assertFinite(n)
  return n.toLocaleString(LOCALE)
}

/** Whole euros, e.g. 1407 -> "1.407 €" (non-breaking space). */
export function formatEuro(n: number): string {
  assertFinite(n)
  return `${n.toLocaleString(LOCALE)}${NBSP}€`
}

/** Euros with two decimals, e.g. 1444 -> "1.444,00 €" (non-breaking space). */
export function formatEuroCents(n: number): string {
  assertFinite(n)
  return `${n.toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${NBSP}€`
}
