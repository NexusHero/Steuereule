/** What the masking leaves in a stored question when the user had not consented yet (ADR-0091). */
const MASK = /\[(?:[A-ZÄÖÜ]+-)+GESCHÜTZT\]|\[MANDANT\]/gu

/** Whether `typed` can be the text behind its masked, stored form: the unmasked pieces appear in it, in order. */
function isMaskedFormOf(stored: string, typed: string): boolean {
  let from = 0
  for (const piece of stored.split(MASK)) {
    const text = piece.trim()
    if (text === '') continue
    const at = typed.indexOf(text, from)
    if (at === -1) return false
    from = at + text.length
  }
  return true
}

/**
 * The words the chat sends again, in place of the refused turn, once the user allowed personal
 * data: the question as it was typed. The stored question is its masked form, so the typed text
 * is only known in the session that sent it; without it there is nothing to repeat and the chat
 * tells the owl in a sentence that the consent now exists.
 */
export function textToRepeatAfterConsent(stored: string, lastTyped: string | null): string | null {
  MASK.lastIndex = 0
  if (!MASK.test(stored)) return stored
  return lastTyped !== null && isMaskedFormOf(stored, lastTyped) ? lastTyped : null
}
