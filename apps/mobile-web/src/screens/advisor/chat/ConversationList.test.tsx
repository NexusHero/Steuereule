import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { createAppI18n } from '../../../i18n/app-i18n'
import { ConversationList, type ConversationListProps } from './ConversationList'

const conversations = [
  { id: 'c2', title: 'Vermietung Musterweg', createdAt: '2026-03-02T10:00:00.000Z', lastUsedAt: '2026-03-05T10:00:00.000Z' },
  { id: 'c1', title: null, createdAt: '2026-01-15T10:00:00.000Z', lastUsedAt: '2026-01-15T10:00:00.000Z' },
]

function renderList(props: Partial<ConversationListProps> = {}) {
  const handlers = { onSelect: vi.fn(), onNew: vi.fn(), onRename: vi.fn().mockResolvedValue(undefined), onDelete: vi.fn().mockResolvedValue(undefined) }
  render(
    <I18nextProvider i18n={createAppI18n('de')}>
      <ThemeProvider mode="light">
        <ConversationList conversations={conversations} activeId="c2" canSwitch {...handlers} {...props} />
      </ThemeProvider>
    </I18nextProvider>,
  )
  return handlers
}

describe('ConversationList (#481)', () => {
  it('lists the conversations, the open one marked, an unnamed one under its date', () => {
    renderList()
    const rows = screen.getAllByTestId('eule-conversation-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.textContent).toContain('Vermietung Musterweg')
    expect(rows[0]!.textContent).toContain('geöffnet')
    expect(rows[1]!.textContent).toContain('Gespräch vom 15.01.2026')
  })

  it('opens another conversation, not the one already open', () => {
    const { onSelect } = renderList()
    const open = screen.getAllByTestId('eule-conversation-open')
    fireEvent.click(open[0]!)
    expect(onSelect).not.toHaveBeenCalled()
    fireEvent.click(open[1]!)
    expect(onSelect).toHaveBeenCalledWith('c1')
  })

  it('starts a new conversation', () => {
    const { onNew } = renderList()
    fireEvent.click(screen.getByTestId('eule-conversation-new'))
    expect(onNew).toHaveBeenCalledTimes(1)
  })

  it('does not switch or start anything while an answer is being written', () => {
    const { onSelect, onNew } = renderList({ canSwitch: false })
    fireEvent.click(screen.getAllByTestId('eule-conversation-open')[1]!)
    fireEvent.click(screen.getByTestId('eule-conversation-new'))
    expect(onSelect).not.toHaveBeenCalled()
    expect(onNew).not.toHaveBeenCalled()
  })

  it('renames a conversation', async () => {
    const { onRename } = renderList()
    fireEvent.click(screen.getAllByTestId('eule-conversation-rename')[1]!)
    fireEvent.change(screen.getByTestId('eule-conversation-rename-input'), { target: { value: 'Arbeitsweg' } })
    fireEvent.click(screen.getByTestId('eule-conversation-rename-save'))
    expect(onRename).toHaveBeenCalledWith('c1', 'Arbeitsweg')
    await waitFor(() => expect(screen.queryByTestId('eule-conversation-rename-input')).toBeNull())
  })

  it('deletes only after a second, explicit step', async () => {
    const { onDelete } = renderList()
    fireEvent.click(screen.getAllByTestId('eule-conversation-delete')[0]!)
    expect(onDelete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('eule-conversation-delete-cancel'))
    expect(screen.queryByTestId('eule-conversation-delete-confirm')).toBeNull()

    fireEvent.click(screen.getAllByTestId('eule-conversation-delete')[0]!)
    fireEvent.click(screen.getByTestId('eule-conversation-delete-confirm'))
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('c2'))
  })

  it('says so when a change could not be stored', async () => {
    renderList({ onDelete: vi.fn().mockRejectedValue(new Error('offline')) })
    fireEvent.click(screen.getAllByTestId('eule-conversation-delete')[0]!)
    fireEvent.click(screen.getByTestId('eule-conversation-delete-confirm'))
    expect((await screen.findByTestId('eule-conversation-failed')).textContent).toContain('nicht geklappt')
  })
})
