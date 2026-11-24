import { parseGermanAmount, parseSignedGermanAmount } from './germanNumber'

/**
 * Whole, non-negative euros (or francs) from an amount typed as it is printed (the shared German parser,
 * WEB-46), rounded half up. Receipts print cents and rappen, the forms take whole amounts; without this a
 * typed „7.021,48“ or „948,60“ was silently treated as not entered. An empty or malformed field is "not
 * entered", never 0.
 */
export function wholeEurosFrom(text: string): number | null {
  const amount = parseGermanAmount(text)
  return amount === null ? null : Math.round(amount)
}

/** The same for the few fields that may be negative (Lohnausweis Ziffer 7, a refund): the magnitude is rounded. */
export function signedWholeAmountFrom(text: string): number | null {
  const amount = parseSignedGermanAmount(text)
  if (amount === null) return null
  const magnitude = Math.round(Math.abs(amount))
  return amount < 0 && magnitude !== 0 ? -magnitude : magnitude
}
