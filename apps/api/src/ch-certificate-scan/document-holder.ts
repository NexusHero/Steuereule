import { foldName, printedHolderName } from '@steuereule/core'

interface PersonName {
  readonly firstName: string | null
  readonly lastName: string | null
}

/** The holder name a document prints: one rule with the document assignment (ADR-0092). */
export { printedHolderName }

/** Whether A's complete name (first and last) is printed anywhere on the document. */
function namesA(rawText: string, a: PersonName): boolean {
  if (!a.firstName || !a.lastName) return false
  const printed = new Set(foldName(rawText))
  return [...foldName(a.firstName), ...foldName(a.lastName)].every((n) => printed.has(n))
}

/**
 * Whose a document is when the chat gives no person and no Person B is on record. It is A's, unless it
 * names someone who is not A: then it is a partner's or a stranger's, and the answer is null so that
 * nothing lands in A's record or supersedes A's drafts ("Wessen Beleg ist das?"). No recognisable name,
 * or no name on record for A to compare with: A, as before.
 */
export function holderWithoutPartner(rawText: string, a: PersonName, holderName: string | null = printedHolderName(rawText)): 'A' | null {
  if (!a.firstName || !a.lastName) return 'A'
  if (namesA(rawText, a) || (holderName !== null && namesA(holderName, a))) return 'A'
  return holderName === null ? 'A' : null
}
