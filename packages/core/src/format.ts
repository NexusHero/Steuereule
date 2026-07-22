// de-DE number/currency formatting — the single formatting source for the whole app
// (design-system rule 10; successor of ui_kits/app/demo-daten.js). A non-breaking space
// ( ) sits between the number and the unit so pills/sticker never wrap at 375px
// (guidelines/qa-checkliste.md).

const LOCALE = 'de-DE'
const NBSP = ' '

function pruefeEndlich(n: number): void {
  if (!Number.isFinite(n)) {
    throw new RangeError('Wert muss eine endliche Zahl sein')
  }
}

/** Grouped integer, e.g. 1407 -> "1.407". */
export function formatZahl(n: number): string {
  pruefeEndlich(n)
  return n.toLocaleString(LOCALE)
}

/** Whole euros, e.g. 1407 -> "1.407 €" (non-breaking space). */
export function formatEuro(n: number): string {
  pruefeEndlich(n)
  return `${n.toLocaleString(LOCALE)}${NBSP}€`
}

/** Euros with two decimals, e.g. 1444 -> "1.444,00 €" (non-breaking space). */
export function formatEuroCent(n: number): string {
  pruefeEndlich(n)
  return `${n.toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${NBSP}€`
}
