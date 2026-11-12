/**
 * Project notes (#481): what was settled in a conversation but is not a value of the return —
 * "Arbeitszimmer lohnt sich nicht, weil …". They belong to the tax year, every conversation of
 * that year reads them, and the owl keeps them itself: it adds, replaces and removes notes without
 * a click. That is the one place where the owl writes on its own; the return itself still changes
 * only when the user applies a draft. Every change is shown under the answer and can be undone.
 */
export const ADVISOR_NOTES_MAX = 20
export const ADVISOR_NOTE_MAX_CHARS = 200

/** A stored note under the neutral name the model uses for it. */
export interface AdvisorNoteHandle {
  readonly handle: string
  readonly id: string
  readonly text: string
}

export type AdvisorNoteChangeKind = 'added' | 'replaced' | 'removed'

/** One change the owl made to the notes in an answer. */
export interface AdvisorNoteChange {
  readonly kind: AdvisorNoteChangeKind
  /** The note it concerns; set by the server once an added note exists. */
  readonly noteId?: string | undefined
  /** The text after the change; for a removed note, the text that went. */
  readonly text: string
  /** What a replaced note said before. */
  readonly previousText?: string | undefined
  /** True once the user took the change back. */
  readonly undone?: true | undefined
}

export function buildNoteHandles(notes: ReadonlyArray<{ readonly id: string; readonly text: string }>): AdvisorNoteHandle[] {
  return notes.map((note, index) => ({ handle: `Notiz ${index + 1}`, id: note.id, text: note.text }))
}

/** Finds the note a tool call means: by its name („Notiz 2“, „2“) or by its id. */
export function resolveNoteHandle(handles: readonly AdvisorNoteHandle[], raw: string): AdvisorNoteHandle | null {
  const wanted = raw.trim().toLowerCase()
  const exact = handles.find((note) => note.handle.toLowerCase() === wanted || note.id === raw.trim())
  if (exact) return exact
  const position = /(\d{1,2})\s*$/.exec(wanted)
  return position ? (handles[Number(position[1]) - 1] ?? null) : null
}

export type NoteTextCheck = { readonly ok: true; readonly text: string } | { readonly ok: false; readonly reason: string }

/** One line, trimmed, within the length a note may have. */
export function tidyNoteText(raw: string): NoteTextCheck {
  const text = raw.replace(/\s+/g, ' ').trim()
  if (text === '') return { ok: false, reason: 'Eine Notiz braucht einen Text.' }
  if (text.length > ADVISOR_NOTE_MAX_CHARS) return { ok: false, reason: `Eine Notiz darf höchstens ${ADVISOR_NOTE_MAX_CHARS} Zeichen haben.` }
  return { ok: true, text }
}

/** What the model is told about the notes of the year. */
export function describeNotesForPrompt(handles: readonly AdvisorNoteHandle[]): string {
  if (handles.length === 0) return 'Projektnotizen dieses Steuerjahres: keine.'
  return ['Projektnotizen dieses Steuerjahres (gelten in jedem Gespräch):', ...handles.map((note) => `${note.handle}: ${note.text}`)].join('\n')
}
