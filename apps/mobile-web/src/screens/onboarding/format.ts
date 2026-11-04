export function formatSteuerId(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11)
  return digits.replace(/^(\d{2})(\d{0,3})(\d{0,3})(\d{0,3}).*$/, (_m, a, b, c, d) =>
    [a, b, c, d].filter(Boolean).join(' '),
  )
}

export function countDigits(value: string): number {
  return value.replace(/\D/g, '').length
}

export function formatSteuerNr(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 13)
  return digits.replace(/^(\d{2,3})(\d{0,3})(\d{0,5}).*$/, (_m, a, b, c) => [a, b, c].filter(Boolean).join('/'))
}
