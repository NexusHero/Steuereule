export function formatTaxId(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11)
  return digits.replace(/^(\d{2})(\d{0,3})(\d{0,3})(\d{0,3}).*$/, (_m, a, b, c, d) =>
    [a, b, c, d].filter(Boolean).join(' '),
  )
}

export function countDigits(value: string): number {
  return value.replace(/\D/g, '').length
}

const MAX_TAX_NUMBER_DIGITS = 13

/**
 * Keeps the separators the user types: the Steuernummer layout differs by Bundesland (BW 2/3/5,
 * Bayern 3/3/5, NRW 3/4/4), so regrouping it would break correct input. Only digits, "/" and single
 * spaces survive, capped at 13 digits.
 */
export function sanitizeTaxNumberInput(raw: string): string {
  let digits = 0
  let out = ''
  for (const ch of raw) {
    if (/\d/.test(ch)) {
      if (digits === MAX_TAX_NUMBER_DIGITS) break
      digits += 1
      out += ch
    } else if ((ch === '/' || ch === ' ') && out !== '' && !/[/ ]$/.test(out)) {
      out += ch
    }
  }
  return out
}

/**
 * Groups a stored, digits-only Steuernummer only where the layout is unambiguous: every 10-digit
 * Landesformat is 2/3/5. 11 digits (Bayern 3/3/5 vs. NRW 3/4/4) and the 13-digit federal format stay
 * ungrouped rather than grouped wrongly.
 */
export function formatStoredTaxNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, MAX_TAX_NUMBER_DIGITS)
  if (digits.length === 10) return `${digits.slice(0, 2)}/${digits.slice(2, 5)}/${digits.slice(5)}`
  return digits
}
