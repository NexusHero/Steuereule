/**
 * Whole, non-negative euros (or francs) from an amount typed as it is printed: thousands grouped with dots,
 * apostrophes or spaces, and up to two decimals after a comma or a point, rounded half up. Receipts print
 * cents and rappen, the forms take whole amounts; without this a typed „7.021,48“ or „948,60“ was silently
 * treated as not entered. An empty or malformed field is "not entered", never 0.
 */
export function wholeEurosFrom(text: string): number | null {
  const trimmed = text.trim()
  const match = /^(0|[1-9]\d{0,2}(?:[.'’  ]\d{3})+|[1-9]\d*)(?:[.,](\d{1,2}))?$/.exec(trimmed)
  const [, wholeText, centText] = match ?? []
  if (wholeText === undefined) return null
  const whole = Number(wholeText.replaceAll(/[.'’  ]/g, ''))
  const cents = centText === undefined ? 0 : Number(centText.padEnd(2, '0'))
  return cents >= 50 ? whole + 1 : whole
}

/** The same for the few fields that may be negative (Lohnausweis Ziffer 7, a refund): the magnitude is rounded. */
export function signedWholeAmountFrom(text: string): number | null {
  const trimmed = text.trim().replace(/^[−–]/, '-')
  const negative = trimmed.startsWith('-')
  const magnitude = wholeEurosFrom(negative ? trimmed.slice(1) : trimmed)
  if (magnitude === null) return null
  return negative && magnitude !== 0 ? -magnitude : magnitude
}
