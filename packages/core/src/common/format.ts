const LOCALE = 'de-DE'
const NBSP = '\u00A0'

function assertFinite(n: number): void {
  if (!Number.isFinite(n)) {
    throw new RangeError('Value must be a finite number')
  }
}

export function formatNumber(n: number): string {
  assertFinite(n)
  return n.toLocaleString(LOCALE)
}

export function formatEuro(n: number): string {
  assertFinite(n)
  return `${n.toLocaleString(LOCALE)}${NBSP}€`
}

export function formatEuroCents(n: number): string {
  assertFinite(n)
  return `${n.toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${NBSP}€`
}

export function formatEuroRange(from: number, to: number): string {
  assertFinite(from)
  assertFinite(to)
  if (from > to) {
    throw new RangeError('`from` must not exceed `to`')
  }
  if (from === to) {
    return formatEuro(from)
  }
  return `${from.toLocaleString(LOCALE)}–${to.toLocaleString(LOCALE)}${NBSP}€`
}

function formatMoney(n: number, unit: string): string {
  assertFinite(n)
  const digits = Number.isInteger(n) ? 0 : 2
  return `${n.toLocaleString(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits })}${NBSP}${unit}`
}

/** An amount in euros as people read it (ADR-0097): `3.135 €`, with cents `1.234,50 €`. */
export function formatEur(n: number): string {
  return formatMoney(n, '€')
}

/** An amount in Swiss francs as people read it (ADR-0097): `119.580 CHF`, with Rappen `0,05 CHF`. */
export function formatChf(n: number): string {
  return formatMoney(n, 'CHF')
}
