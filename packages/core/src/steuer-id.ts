export function isValidSteuerId(value: string): boolean {
  return /^\d{11}$/.test(value)
}

export function isValidSteuernummer(value: string | undefined | null): boolean {
  if (value === undefined || value === null) return true
  return /^\d{1,13}$/.test(value)
}
