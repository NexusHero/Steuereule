import { parseGermanAmount } from './germanNumber'
import { wholeEurosFrom } from './wholeEuros'

/**
 * What a committed amount field holds (WEB-12, WEB-13): nothing (`null`), an amount, or text the app cannot read —
 * which the field names instead of dropping it silently or storing a shortened number.
 */
export type CommittedAmount = number | null | 'unreadable'

/** Whole euros, typed the German way („40.000“, „948,60“). */
export function wholeEurosOrUnreadable(text: string): CommittedAmount {
  if (text.trim() === '') return null
  return wholeEurosFrom(text) ?? 'unreadable'
}

/** Euros with cents, typed the German way. */
export function eurosWithCentsOrUnreadable(text: string): CommittedAmount {
  if (text.trim() === '') return null
  return parseGermanAmount(text) ?? 'unreadable'
}
