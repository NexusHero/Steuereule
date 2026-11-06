/** Whole, non-negative euro amount from a text field; an empty field is "not entered", never 0. */
export function integerFrom(text: string): number | null {
  const trimmed = text.trim()
  return /^(0|[1-9]\d*)$/.test(trimmed) ? Number(trimmed) : null
}
