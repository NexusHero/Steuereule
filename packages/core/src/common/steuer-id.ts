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
