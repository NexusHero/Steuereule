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

export type ReligionKey = (typeof RELIGION_KEYS)[number]
export const MARITAL_STATUSES = ['ledig', 'verheiratet', 'verwitwet', 'geschieden', 'dauernd-getrennt'] as const
export type MaritalStatus = (typeof MARITAL_STATUSES)[number]

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
