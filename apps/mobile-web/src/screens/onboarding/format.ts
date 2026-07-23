// Pure formatting/counting helpers for the Onboarding tax-id fields. Mirrors
// finanzo-funke-design-system/project/ui_kits/app/Onboarding.jsx (formatSteuerId / formatSteuerNr)
// exactly, ported to TypeScript. Kept out of the screen component so the masks stay a small,
// independently testable seam.

/** Steuer-ID: up to 11 digits, grouped 2-3-3-3 ("12 345 678 901"). */
export function formatSteuerId(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11)
  return digits.replace(/^(\d{2})(\d{0,3})(\d{0,3})(\d{0,3}).*$/, (_m, a, b, c, d) =>
    [a, b, c, d].filter(Boolean).join(' '),
  )
}

/** Digit count of a (possibly already formatted) value — drives the "n/11 digits" counter. */
export function countDigits(value: string): number {
  return value.replace(/\D/g, '').length
}

/** Steuernummer (shortened, state-dependent format): up to 13 digits, grouped 2-3/3/5. */
export function formatSteuerNr(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 13)
  return digits.replace(/^(\d{2,3})(\d{0,3})(\d{0,5}).*$/, (_m, a, b, c) => [a, b, c].filter(Boolean).join('/'))
}
