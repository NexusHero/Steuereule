import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { createAppI18n } from '../../../i18n/app-i18n'
import { NoteChangeHints, ProjectNotes, type NoteChangeHintsProps, type ProjectNotesProps } from './ProjectNotes'

const wrap = (node: React.ReactNode) =>
  render(
    <I18nextProvider i18n={createAppI18n('de')}>
      <ThemeProvider mode="light">{node}</ThemeProvider>
    </I18nextProvider>,
  )

const NOTES = [
  { id: 'n1', text: 'Arbeitszimmer geprüft: lohnt sich nicht.', author: 'owl' as const },
  { id: 'n2', text: 'Fahrtenbuch reiche ich nach.', author: 'user' as const },
]

function renderNotes(props: Partial<ProjectNotesProps> = {}) {
  const handlers = { onAdd: vi.fn().mockResolvedValue(undefined), onEdit: vi.fn().mockResolvedValue(undefined), onDelete: vi.fn().mockResolvedValue(undefined) }
  wrap(<ProjectNotes notes={NOTES} {...handlers} {...props} />)
  return handlers
}

describe('ProjectNotes (#481)', () => {
  it('lists every note with who wrote it', () => {
    renderNotes()
    const rows = screen.getAllByTestId('eule-note-row')
    expect(rows[0]!.textContent).toContain('Arbeitszimmer geprüft')
    expect(rows[0]!.textContent).toContain('von der Eule')
    expect(rows[1]!.textContent).toContain('von dir')
  })

  it('says so when there are none yet', () => {
    renderNotes({ notes: [] })
    expect(screen.getByTestId('eule-notes-empty').textContent).toContain('Noch keine Notizen')
  })

  it('changes a note', async () => {
    const { onEdit } = renderNotes()
    fireEvent.click(screen.getAllByTestId('eule-note-edit')[0]!)
    fireEvent.change(screen.getByTestId('eule-note-input'), { target: { value: 'Arbeitszimmer lohnt sich doch.' } })
    fireEvent.click(screen.getByTestId('eule-note-save'))
    expect(onEdit).toHaveBeenCalledWith('n1', 'Arbeitszimmer lohnt sich doch.')
    await waitFor(() => expect(screen.queryByTestId('eule-note-input')).toBeNull())
  })

  it('adds a note by hand, and not an empty one', async () => {
    const { onAdd } = renderNotes()
    fireEvent.click(screen.getByTestId('eule-note-add'))
    fireEvent.click(screen.getByTestId('eule-note-save'))
    expect(onAdd).not.toHaveBeenCalled()
    fireEvent.change(screen.getByTestId('eule-note-input'), { target: { value: 'Pflege der Mutter seit März.' } })
    fireEvent.click(screen.getByTestId('eule-note-save'))
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('Pflege der Mutter seit März.'))
  })

  it('deletes a note, and says so when that failed', async () => {
    const { onDelete } = renderNotes()
    fireEvent.click(screen.getAllByTestId('eule-note-delete')[1]!)
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('n2'))
  })

  it('reports a change that could not be stored', async () => {
    renderNotes({ onDelete: vi.fn().mockRejectedValue(new Error('offline')) })
    fireEvent.click(screen.getAllByTestId('eule-note-delete')[0]!)
    expect((await screen.findByTestId('eule-note-failed')).textContent).toContain('nicht geklappt')
  })
})

describe('NoteChangeHints (#481)', () => {
  const renderHints = (props: Partial<NoteChangeHintsProps> = {}) => {
    const onUndo = vi.fn().mockResolvedValue(undefined)
    wrap(
      <NoteChangeHints
        changes={[
          { kind: 'added', text: 'Arbeitszimmer geprüft: lohnt sich nicht.' },
          { kind: 'replaced', text: 'Arbeitsweg 40 km.', previousText: 'Arbeitsweg 38 km.' },
          { kind: 'removed', text: 'Gilt nicht mehr.', undone: true },
        ]}
        onUndo={onUndo}
        {...props}
      />,
    )
    return onUndo
  }

  it('says what the owl noted, updated and removed', () => {
    renderHints()
    const hints = screen.getAllByTestId('advisor-note-change').map((h) => h.textContent)
    expect(hints[0]).toContain('Gemerkt: Arbeitszimmer geprüft')
    expect(hints[1]).toContain('Notiz aktualisiert: Arbeitsweg 40 km.')
    expect(hints[2]).toContain('Notiz entfernt: Gilt nicht mehr.')
  })

  it('takes a change back, and offers no second undo for one already taken back', async () => {
    const onUndo = renderHints()
    const buttons = screen.getAllByTestId('advisor-note-change-undo')
    expect(buttons).toHaveLength(2)
    fireEvent.click(buttons[1]!)
    await waitFor(() => expect(onUndo).toHaveBeenCalledWith(1))
    expect(screen.getByTestId('advisor-note-change-undone').textContent).toContain('zurückgenommen')
  })

  it('says so when undoing failed', async () => {
    renderHints({ onUndo: vi.fn().mockRejectedValue(new Error('offline')) })
    fireEvent.click(screen.getAllByTestId('advisor-note-change-undo')[0]!)
    expect((await screen.findByTestId('advisor-note-change-failed')).textContent).toContain('nicht geklappt')
  })
})
