/** Whole, non-negative euro amount from a text field; an empty field is "not entered", never 0. */
export function ganzzahlAus(text: string): number | null {
  const getrimmt = text.trim()
  return /^(0|[1-9]\d*)$/.test(getrimmt) ? Number(getrimmt) : null
}
