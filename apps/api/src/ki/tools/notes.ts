import { ADVISOR_NOTES_MAX, resolveNoteHandle, tidyNoteText } from '@steuereule/core'
import { checkPiiFree } from '../ki.adapter.js'
import { TOOL_ARG_SCHEMAS } from '../advisor-tools.js'
import { toolHandler } from './tool-call-context.js'

/** The owl's notes for the tax year: remember a new one, replace or forget one by its handle. */
export const notesTool = toolHandler(['remember_note', 'replace_note', 'forget_note'], (call, ctx) => {
  const { turn, answer } = ctx
  // The notes as they stand after what this answer has already changed.
  const gone = new Set(turn.noteChanges.filter((change) => change.kind === 'removed').map((change) => change.noteId))
  const added = turn.noteChanges.filter((change) => change.kind === 'added').length
  const known = (ctx.request.notes ?? []).filter((note) => !gone.has(note.id))
  const refuse = (error: string) => answer({ ok: false, error })

  if (call.name === 'forget_note') {
    const args = ctx.parseArgs(TOOL_ARG_SCHEMAS.forget_note)
    if (args === null) return
    const note = resolveNoteHandle(known, args.note)
    if (!note) {
      refuse(`UNKNOWN_NOTE: „${args.note}“ gibt es nicht. Vorhanden: ${known.map((n) => n.handle).join(', ') || 'keine'}.`)
      return
    }
    turn.noteChanges = [...turn.noteChanges.filter((change) => change.noteId !== note.id), { kind: 'removed', noteId: note.id, text: note.text }]
    answer({ ok: true, removed: note.handle })
    return
  }

  // One parse per call: a failed parse has already answered the call with its error.
  const replaceArgs = call.name === 'replace_note' ? ctx.parseArgs(TOOL_ARG_SCHEMAS.replace_note) : null
  const args = call.name === 'replace_note' ? replaceArgs : ctx.parseArgs(TOOL_ARG_SCHEMAS.remember_note)
  if (args === null) return
  const text = tidyNoteText(args.text)
  if (!text.ok) {
    refuse(`INVALID_NOTE: ${text.reason}`)
    return
  }
  try {
    checkPiiFree({ note: text.text })
  } catch {
    refuse('INVALID_NOTE: Eine Notiz darf keine persönlichen Daten enthalten (Namen, Adressen, Steuer-ID, IBAN, Geburtsdatum).')
    return
  }
  if (replaceArgs !== null) {
    const note = resolveNoteHandle(known, replaceArgs.note)
    if (!note) {
      refuse(`UNKNOWN_NOTE: „${replaceArgs.note}“ gibt es nicht. Vorhanden: ${known.map((n) => n.handle).join(', ') || 'keine'}.`)
      return
    }
    const before = turn.noteChanges.find((change) => change.noteId === note.id)?.previousText ?? note.text
    turn.noteChanges = [...turn.noteChanges.filter((change) => change.noteId !== note.id), { kind: 'replaced', noteId: note.id, text: text.text, previousText: before }]
    answer({ ok: true, replaced: note.handle })
    return
  }
  if (known.length + added >= ADVISOR_NOTES_MAX) {
    refuse(`TOO_MANY_NOTES: höchstens ${ADVISOR_NOTES_MAX} Notizen. Ersetze oder entferne zuerst eine überholte.`)
    return
  }
  if ([...known.map((n) => n.text), ...turn.noteChanges.filter((c) => c.kind === 'added').map((c) => c.text)].some((existing) => existing.toLowerCase() === text.text.toLowerCase())) {
    answer({ ok: true, alreadyNoted: true })
    return
  }
  turn.noteChanges = [...turn.noteChanges, { kind: 'added', text: text.text }]
  answer({ ok: true, noted: text.text })
})
