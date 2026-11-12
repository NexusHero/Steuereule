export const RELIGION_KEYS = [
  'VD',
  'EV',
  'RK',
  'AK',
  'FA',
  'FB',
  'FG',
  'FM',
  'FS',
  'IB',
  'IL',
  'IS',
  'IW',
  'JD',
  'JH',
] as const
export const MARITAL_STATUSES = ['ledig', 'verheiratet', 'verwitwet', 'geschieden', 'dauernd-getrennt'] as const

export function normalizeIban(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase()
}

export function isValidIban(value: string): boolean {
  const iban = normalizeIban(value)
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false
  if (iban.startsWith('DE') && iban.length !== 22) return false
  const transposed = iban.slice(4) + iban.slice(0, 4)
  let remainder = 0
  for (const char of transposed) {
    const digits = /\d/.test(char) ? char : String(char.charCodeAt(0) - 55)
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97
  }
  return remainder === 1
}

/** Longest IBAN any country issues (ISO 13616). */
const IBAN_MAX_LENGTH = 34
/** Shortest IBAN any country issues (Norway). */
const IBAN_MIN_LENGTH = 15
const GERMAN_IBAN_LENGTH = 22

/** The IBAN as it is printed on a bank card: upper-cased, in blocks of four. */
export function formatIban(value: string): string {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, IBAN_MAX_LENGTH)
  return compact.replace(/(.{4})(?=.)/g, '$1 ')
}

export type IbanCheck = 'empty' | 'incomplete' | 'valid' | 'invalid'

/** What to tell the user while the IBAN is being typed — never "invalid" for one that is just unfinished. */
export function checkIban(value: string): IbanCheck {
  const iban = normalizeIban(value)
  if (iban === '') return 'empty'
  const expected = iban.startsWith('DE') ? GERMAN_IBAN_LENGTH : IBAN_MIN_LENGTH
  if (iban.length < expected) return 'incomplete'
  return isValidIban(iban) ? 'valid' : 'invalid'
}

export function isValidPostalCode(value: string): boolean {
  return /^\d{5}$/.test(value)
}

export function isValidDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export function formatGermanDate(iso: string): string {
  const [year, month, day] = iso.split('-')
  return `${day}.${month}.${year}`
}
