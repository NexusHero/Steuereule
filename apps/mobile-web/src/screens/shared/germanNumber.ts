/**
 * The one parser for amounts typed the German way (WEB-13, WEB-46): thousands grouped with dots (Swiss
 * documents: apostrophes or spaces), decimals after a comma; a point followed by one or two digits is read as
 * a decimal point too, because receipts and Swiss certificates print it so. „40.000“ is forty thousand,
 * „40.000,50“ is forty thousand and fifty cents. Anything else — „1.2.3“, „12,345“, letters, a leading zero —
 * is not a number, never a silently shortened one.
 */
const AMOUNT = /^(0|[1-9]\d{0,2}(?:[.'’  ]\d{3})+|[1-9]\d*)(?:[.,](\d{1,2}))?$/

/** A non-negative amount with up to two decimals, or null. */
export function parseGermanAmount(text: string): number | null {
  const match = AMOUNT.exec(text.trim())
  const [, wholeText, decimalText] = match ?? []
  if (wholeText === undefined) return null
  const whole = Number(wholeText.replaceAll(/[.'’  ]/g, ''))
  const hundredths = decimalText === undefined ? 0 : Number(decimalText.padEnd(2, '0'))
  return (whole * 100 + hundredths) / 100
}

/** The same amount in cents, exact (no floating-point step), or null. */
export function parseGermanCents(text: string): number | null {
  const match = AMOUNT.exec(text.trim())
  const [, wholeText, decimalText] = match ?? []
  if (wholeText === undefined) return null
  const whole = Number(wholeText.replaceAll(/[.'’  ]/g, ''))
  return whole * 100 + (decimalText === undefined ? 0 : Number(decimalText.padEnd(2, '0')))
}

/** A signed amount (a loss, a refund, Lohnausweis Ziffer 7): a leading minus, dash or „−“, then an amount. */
export function parseSignedGermanAmount(text: string): number | null {
  const trimmed = text.trim().replace(/^[−–]/, '-')
  const negative = trimmed.startsWith('-')
  const magnitude = parseGermanAmount(negative ? trimmed.slice(1) : trimmed)
  if (magnitude === null) return null
  return negative && magnitude !== 0 ? -magnitude : magnitude
}
