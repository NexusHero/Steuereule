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
