import { describe, expect, it } from 'vitest'
import { buildNoteHandles, describeNotesForPrompt, resolveNoteHandle, tidyNoteText } from './advisor-notes'

const handles = buildNoteHandles([
  { id: 'n-a', text: 'Arbeitszimmer lohnt sich nicht.' },
  { id: 'n-b', text: 'Fortbildung 2025: Kurs in Köln.' },
])

describe('project notes (#481)', () => {
  it('names notes in their order', () => {
    expect(handles.map((n) => n.handle)).toEqual(['Notiz 1', 'Notiz 2'])
  })

  it.each(['Notiz 2', 'notiz 2', '2', 'n-b'])('finds a note by „%s“', (raw) => {
    expect(resolveNoteHandle(handles, raw)?.id).toBe('n-b')
  })

  it('finds nothing for a note that does not exist', () => {
    expect(resolveNoteHandle(handles, 'Notiz 9')).toBeNull()
    expect(resolveNoteHandle(handles, 'die mit dem Arbeitszimmer')).toBeNull()
  })

  it('tidies a note to one line and refuses an empty or too long one', () => {
    expect(tidyNoteText('  Arbeitszimmer\n lohnt   sich nicht ')).toEqual({ ok: true, text: 'Arbeitszimmer lohnt sich nicht' })
    expect(tidyNoteText('   ').ok).toBe(false)
    expect(tidyNoteText('x'.repeat(201)).ok).toBe(false)
  })

  it('tells the model the notes by name, and says so when there are none', () => {
    expect(describeNotesForPrompt(handles)).toContain('Notiz 1: Arbeitszimmer lohnt sich nicht.')
    expect(describeNotesForPrompt(handles)).not.toContain('n-a')
    expect(describeNotesForPrompt([])).toContain('keine')
  })
})
