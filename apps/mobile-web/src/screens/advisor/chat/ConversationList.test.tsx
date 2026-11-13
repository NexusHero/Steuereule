import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { ConversationList, type ConversationListProps } from './ConversationList'
import { renderInApp } from '../../../test-render'

const conversations = [
  { id: 'c2', title: 'Vermietung Musterweg', createdAt: '2026-03-02T10:00:00.000Z', lastUsedAt: '2026-03-05T10:00:00.000Z' },
  { id: 'c1', title: null, createdAt: '2026-01-15T10:00:00.000Z', lastUsedAt: '2026-01-15T10:00:00.000Z' },
]

function renderList(props: Partial<ConversationListProps> = {}) {
  const handlers = { onSelect: vi.fn(), onNew: vi.fn(), onRename: vi.fn().mockResolvedValue(undefined), onDelete: vi.fn().mockResolvedValue(undefined) }
  renderInApp(<ConversationList conversations={conversations} activeId="c2" canSwitch {...handlers} {...props} />)
  return handlers
}

describe('ConversationList (#481)', () => {
  it('lists the conversations, the open one marked, an unnamed one under its date', () => {
    renderList()
    const rows = screen.getAllByTestId('eule-conversation-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.textContent).toContain('Vermietung Musterweg')
    expect(screen.getAllByTestId('eule-conversation-open')[0]!.getAttribute('aria-current')).toBe('true')
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

  it('keeps renaming and deleting behind each line\'s "…"', () => {
    renderList()
    expect(screen.queryByTestId('eule-conversation-rename')).toBeNull()
    fireEvent.click(screen.getAllByTestId('eule-conversation-menu')[1]!)
    expect(screen.getAllByTestId('eule-conversation-rename')).toHaveLength(1)
    expect(screen.getAllByTestId('eule-conversation-menu')[1]!.getAttribute('aria-expanded')).toBe('true')
  })

  it('renames a conversation', async () => {
    const { onRename } = renderList()
    fireEvent.click(screen.getAllByTestId('eule-conversation-menu')[1]!)
    fireEvent.click(screen.getByTestId('eule-conversation-rename'))
    fireEvent.change(screen.getByTestId('eule-conversation-rename-input'), { target: { value: 'Arbeitsweg' } })
    fireEvent.click(screen.getByTestId('eule-conversation-rename-save'))
    expect(onRename).toHaveBeenCalledWith('c1', 'Arbeitsweg')
    await waitFor(() => expect(screen.queryByTestId('eule-conversation-rename-input')).toBeNull())
  })

  it('deletes only after a second, explicit step', async () => {
    const { onDelete } = renderList()
    fireEvent.click(screen.getAllByTestId('eule-conversation-menu')[0]!)
    fireEvent.click(screen.getByTestId('eule-conversation-delete'))
    expect(onDelete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('eule-conversation-delete-cancel'))
    expect(screen.queryByTestId('eule-conversation-delete-confirm')).toBeNull()

    fireEvent.click(screen.getAllByTestId('eule-conversation-menu')[0]!)
    fireEvent.click(screen.getByTestId('eule-conversation-delete'))
    fireEvent.click(screen.getByTestId('eule-conversation-delete-confirm'))
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('c2'))
  })

  it('says so when a change could not be stored', async () => {
    renderList({ onDelete: vi.fn().mockRejectedValue(new Error('offline')) })
    fireEvent.click(screen.getAllByTestId('eule-conversation-menu')[0]!)
    fireEvent.click(screen.getByTestId('eule-conversation-delete'))
    fireEvent.click(screen.getByTestId('eule-conversation-delete-confirm'))
    expect((await screen.findByTestId('eule-conversation-failed')).textContent).toContain('nicht geklappt')
  })

  it('offers the search as one quiet line that opens the dialog', () => {
    const onOpenSearch = vi.fn()
    renderList({ onOpenSearch })
    expect(screen.queryByTestId('eule-conversation-search')).toBeNull()
    fireEvent.click(screen.getByTestId('eule-conversation-search-open'))
    expect(onOpenSearch).toHaveBeenCalledTimes(1)
  })

  it('has no search line without a search', () => {
    renderList()
    expect(screen.queryByTestId('eule-conversation-search-open')).toBeNull()
  })

  it('explains nothing: the list is the explanation', () => {
    renderList({ activeYear: 2026 })
    expect(screen.getByTestId('eule-conversations').textContent).not.toContain('Alle Gespräche gehören')
  })
})

describe('tax years as projects (#503)', () => {
  const projects = [
    { taxYear: 2026, conversations },
    { taxYear: 2025, conversations: [{ id: 'p1', title: 'Umzug nach Köln', createdAt: '2025-06-01T10:00:00.000Z', lastUsedAt: '2025-06-02T10:00:00.000Z' }] },
    { taxYear: 2024, conversations: [] },
  ]

  it('names the open year and offers the other years with conversations in a menu', () => {
    renderList({ activeYear: 2026, projects })
    expect(screen.getByTestId('eule-project-heading').textContent).toBe('Steuerjahr 2026')
    expect(screen.queryByTestId('eule-year-menu')).toBeNull()
    fireEvent.click(screen.getByTestId('eule-year-menu-toggle'))
    const options = screen.getAllByTestId('eule-year-option')
    expect(options).toHaveLength(1)
    expect(options[0]!.textContent).toContain('Steuerjahr 2025')
    expect(options[0]!.textContent).toContain('1 Gespräch')
  })

  it('switches to another year at its most recent conversation', () => {
    const onSelectInYear = vi.fn()
    const twoIn2025 = [
      ...projects.slice(0, 1),
      {
        taxYear: 2025,
        conversations: [
          { id: 'old', title: 'Alt', createdAt: '2025-01-01T10:00:00.000Z', lastUsedAt: '2025-01-02T10:00:00.000Z' },
          { id: 'new', title: 'Neu', createdAt: '2025-06-01T10:00:00.000Z', lastUsedAt: '2025-06-02T10:00:00.000Z' },
        ],
      },
    ]
    renderList({ activeYear: 2026, projects: twoIn2025, onSelectInYear })
    fireEvent.click(screen.getByTestId('eule-year-menu-toggle'))
    fireEvent.click(screen.getByTestId('eule-year-option'))
    expect(onSelectInYear).toHaveBeenCalledWith(2025, 'new')
    expect(screen.queryByTestId('eule-year-menu')).toBeNull()
  })

  it('offers no menu while the open year is the only one', () => {
    renderList({ activeYear: 2026, projects: projects.slice(0, 1) })
    fireEvent.click(screen.getByTestId('eule-year-menu-toggle'))
    expect(screen.queryByTestId('eule-year-menu')).toBeNull()
  })

  it('marks a conversation that is answering and does not offer to delete it', () => {
    renderList({ activeYear: 2026, projects, answeringIds: ['c1'] })
    const rows = screen.getAllByTestId('eule-conversation-row')
    expect(rows[1]!.textContent).toContain('antwortet gerade')
    expect(rows[0]!.textContent).not.toContain('antwortet gerade')
    const isDisabled = (el: HTMLElement) => (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true'
    fireEvent.click(screen.getAllByTestId('eule-conversation-menu')[1]!)
    expect(isDisabled(screen.getByTestId('eule-conversation-delete'))).toBe(true)
    fireEvent.click(screen.getAllByTestId('eule-conversation-menu')[1]!)
    fireEvent.click(screen.getAllByTestId('eule-conversation-menu')[0]!)
    expect(isDisabled(screen.getByTestId('eule-conversation-delete'))).toBe(false)
  })

  it('also marks one that the server says is answering, on another device', () => {
    renderList({ conversations: [{ ...conversations[0]!, answering: true }, conversations[1]!] })
    expect(screen.getAllByTestId('eule-conversation-row')[0]!.textContent).toContain('antwortet gerade')
  })

  it('lets the user switch while an answer is written elsewhere', () => {
    const { onSelect } = renderList({ answeringIds: ['c2'] })
    fireEvent.click(screen.getAllByTestId('eule-conversation-open')[1]!)
    expect(onSelect).toHaveBeenCalledWith('c1')
  })
})
