/**
 * Validates German tax identification numbers (Steuer-ID) and tax numbers (Steuernummer).
 */
export function isValidTaxId(value: string): boolean {
  return /^\d{11}$/.test(value)
}

export function isValidTaxNumber(value: string | undefined | null): boolean {
  if (value === undefined || value === null) return true
  return /^\d{1,13}$/.test(value)
}

export type TaxIdCheck = 'incomplete' | 'valid' | 'invalid'

/**
 * The full check of a Steuer-ID (§ 139b AO, BZSt): 11 digits, no leading 0, among the first ten
 * digits exactly one appears two or three times, and the 11th digit is the ISO 7064 MOD 11,10
 * check digit. Used as a hint while typing (#452 decision 11); it never blocks a save, because
 * synthetic test IDs must keep working.
 */
export function checkTaxId(raw: string): TaxIdCheck {
  const value = raw.replace(/\s+/g, '')
  if (!/^\d*$/.test(value)) return 'invalid'
  if (value.length < 11) return 'incomplete'
  if (value.length > 11 || value[0] === '0') return 'invalid'
  const digits = value.slice(0, 10).split('').map(Number)
  const counts = new Map<number, number>()
  for (const d of digits) counts.set(d, (counts.get(d) ?? 0) + 1)
  const repeated = [...counts.values()].filter((c) => c > 1)
  if (repeated.length !== 1 || repeated[0]! > 3) return 'invalid'
  let product = 10
  for (const d of digits) {
    let sum = (d + product) % 10
    if (sum === 0) sum = 10
    product = (sum * 2) % 11
  }
  const check = 11 - product === 10 ? 0 : 11 - product
  return check === Number(value[10]) ? 'valid' : 'invalid'
}
