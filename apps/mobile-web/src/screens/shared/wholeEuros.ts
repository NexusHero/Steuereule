/**
 * Whole, non-negative euros from an amount typed as it is printed: thousands dots and up to two decimals after
 * a comma (or a point), rounded half up. The LStB prints cents, the form takes whole euros; without this a typed
 * „7.021,48“ was silently treated as not entered. An empty or malformed field is "not entered", never 0.
 */
export function wholeEurosFrom(text: string): number | null {
  const trimmed = text.trim()
  const match = /^(0|[1-9]\d{0,2}(?:\.\d{3})+|[1-9]\d*)(?:[.,](\d{1,2}))?$/.exec(trimmed)
  const [, euroText, centText] = match ?? []
  if (euroText === undefined) return null
  const euros = Number(euroText.replaceAll('.', ''))
  const cents = centText === undefined ? 0 : Number(centText.padEnd(2, '0'))
  return cents >= 50 ? euros + 1 : euros
}
