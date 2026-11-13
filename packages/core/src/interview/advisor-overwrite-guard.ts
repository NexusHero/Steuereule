/**
 * The owl may fill an empty field, but it may not change a recorded one on its own (ADR-0082). In the real
 * case it proposed ten times a premium already read from the employer's letter, while the user had only
 * answered „pays nothing herself“. A draft for a field that already holds a value stands only when the
 * user's message asks for a change: it names the new value, or says to change or correct something. A draft
 * that would write the value already there is dropped as well.
 */

export interface GuardedDraft {
  readonly field: string
  readonly label: string
  readonly newValue: string
  /** The raw value recorded now; null or empty when the field is empty. */
  readonly expectedPreviousValue?: string | null | undefined
}

export interface HeldDraft {
  readonly label: string
  readonly recorded: string
  readonly proposed: string
}

const CHANGE_INTENT = /(?:ä|ae)nder|korrigier|berichtig|falsch|stimmt nicht|stattdessen|\bstatt\b|ersetz|richtig (?:ist|sind|w(?:ä|a)re)|(?:ü|ue)berschreib|anpass|aktualisier|neuer? (?:wert|betrag)|update/i

/** Whole numbers the user wrote: „5.120“, „5’120,00“, „512 CHF“, „1 234,60“ → 5120, 5120, 512, 1235. */
export function numbersInMessage(message: string): ReadonlySet<number> {
  const found = new Set<number>()
  for (const m of message.matchAll(/\d{1,3}(?:[.'’\u00a0 ]\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?/g)) {
    let token = m[0]
    let fraction = 0
    const decimal = /,(\d{1,2})$/.exec(token) ?? /^\d+\.(\d{1,2})$/.exec(token)
    if (decimal) {
      fraction = Number(`0.${decimal[1]}`)
      token = token.slice(0, token.length - decimal[1]!.length - 1)
    }
    const whole = Number(token.replace(/\D/g, ''))
    found.add(whole)
    found.add(Math.round(whole + fraction))
  }
  return found
}

function asked(draft: GuardedDraft, message: string, numbers: ReadonlySet<number>): boolean {
  if (CHANGE_INTENT.test(message)) return true
  if (/^-?\d+$/.test(draft.newValue)) return numbers.has(Math.abs(Number(draft.newValue)))
  return message.toLowerCase().includes(draft.newValue.toLowerCase())
}

export function holdUnaskedOverwrites<T extends GuardedDraft>(drafts: readonly T[], userMessage: string): { readonly kept: T[]; readonly held: HeldDraft[]; readonly unchanged: T[] } {
  const numbers = numbersInMessage(userMessage)
  const kept: T[] = []
  const held: HeldDraft[] = []
  const unchanged: T[] = []
  for (const draft of drafts) {
    const recorded = draft.expectedPreviousValue
    // „0“ is what an untouched mask holds (no vacation days, no allowance): filling it is no change.
    if (recorded === null || recorded === undefined || recorded === '' || recorded === '0') kept.push(draft)
    else if (recorded === draft.newValue) unchanged.push(draft)
    else if (asked(draft, userMessage, numbers)) kept.push(draft)
    else held.push({ label: draft.label, recorded, proposed: draft.newValue })
  }
  return { kept, held, unchanged }
}

/** The line the owl adds to its answer for what it left as it was. */
export function heldDraftsNote(held: readonly HeldDraft[]): string {
  if (held.length === 0) return ''
  const items = held.map((h) => `${h.label}: steht schon auf ${h.recorded} (mein Vorschlag wäre ${h.proposed})`).join('; ')
  return `\n\nUnverändert gelassen, weil schon eingetragen: ${items}. Wenn ein Wert falsch ist, sag mir den richtigen, dann bereite ich die Änderung vor.`
}
