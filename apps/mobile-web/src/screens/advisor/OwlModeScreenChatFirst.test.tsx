import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { createAppI18n } from '../../i18n/app-i18n'
import { OwlModeScreen } from './OwlModeScreen'

const CONVERSATIONS = [
  { id: 'c2', title: 'Homeoffice oder Arbeitszimmer?', createdAt: '2026-03-02T10:00:00.000Z', lastUsedAt: '2026-03-05T10:00:00.000Z' },
  { id: 'c1', title: 'Fortbildung', createdAt: '2026-01-15T10:00:00.000Z', lastUsedAt: '2026-01-15T10:00:00.000Z' },
]

function setViewportWidth(width: number) {
  Object.defineProperty(document.documentElement, 'clientWidth', { value: width, configurable: true })
  window.dispatchEvent(new Event('resize'))
}

function renderScreen(props: Partial<Parameters<typeof OwlModeScreen>[0]> = {}) {
  const handlers = {
    onSelectConversation: vi.fn(),
    onNewConversation: vi.fn(),
    onSearchConversations: vi.fn().mockResolvedValue([]),
    onSaveSituation: vi.fn().mockResolvedValue(undefined),
    onAddNote: vi.fn().mockResolvedValue(undefined),
    onEditNote: vi.fn().mockResolvedValue(undefined),
    onDeleteNote: vi.fn().mockResolvedValue(undefined),
  }
  render(
    <I18nextProvider i18n={createAppI18n('de')}>
      <ThemeProvider mode="light">
        <OwlModeScreen taxYear={2026} initialCards={[]} conversations={CONVERSATIONS} activeConversationId="c2" situation="" notes={[]} {...handlers} {...props} />
      </ThemeProvider>
    </I18nextProvider>,
  )
  return handlers
}

afterEach(() => setViewportWidth(0))

describe('the owl screen puts the chat first (#476, chat-first)', () => {
  it('keeps the sidebar to conversations: new, search, the year and the list, no situation and no notes', () => {
    setViewportWidth(1440)
    renderScreen()
    const sidebar = screen.getByTestId('eule-project-sidebar')
    expect(sidebar.textContent).toContain('Neues Gespräch')
    expect(sidebar.textContent).toContain('Suchen')
    expect(sidebar.textContent).toContain('Steuerjahr 2026')
    expect(screen.getAllByTestId('eule-conversation-row')).toHaveLength(2)
    expect(sidebar.querySelector('[data-testid="eule-situation"]')).toBeNull()
    expect(sidebar.querySelector('[data-testid="eule-notes"]')).toBeNull()
    expect(screen.queryByTestId('eule-conversation-search')).toBeNull()
  })

  it('opens the search as a dialog from the magnifier and with Ctrl+K', () => {
    setViewportWidth(1440)
    renderScreen()
    fireEvent.click(screen.getByTestId('eule-conversation-search-open'))
    expect(screen.getByTestId('eule-search-sheet')).toBeDefined()
    expect(screen.getByTestId('eule-conversation-search')).toBeDefined()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByTestId('eule-search-sheet')).toBeNull()

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(screen.getByTestId('eule-search-sheet')).toBeDefined()
  })

  it('shows the conversations as a drawer from the left below desktop width', () => {
    setViewportWidth(1024)
    renderScreen()
    expect(screen.queryByTestId('eule-project-sidebar')).toBeNull()
    fireEvent.click(screen.getByTestId('eule-conversations-btn'))
    expect(screen.getByTestId('eule-conversations-drawer')).toBeDefined()
    expect(screen.getAllByTestId('eule-conversation-row')).toHaveLength(2)
    fireEvent.click(screen.getByTestId('eule-conversations-drawer-backdrop'))
    expect(screen.queryByTestId('eule-conversations-drawer')).toBeNull()
  })

  it('closes the drawer when a conversation is opened from it', () => {
    setViewportWidth(390)
    const { onSelectConversation } = renderScreen()
    fireEvent.click(screen.getByTestId('eule-conversations-btn'))
    fireEvent.click(screen.getAllByTestId('eule-conversation-open')[1]!)
    expect(onSelectConversation).toHaveBeenCalledWith('c1')
    expect(screen.queryByTestId('eule-conversations-drawer')).toBeNull()
  })

  it('invites to add the situation from the composer and opens it with the owl\'s notes', () => {
    setViewportWidth(1440)
    renderScreen()
    const chip = screen.getByTestId('eule-situation-chip')
    expect(chip.textContent).toContain('Situation ergänzen')
    fireEvent.click(chip)
    const sheet = screen.getByTestId('eule-situation-sheet')
    expect(sheet.textContent).toContain('Was die Eule über euch weiß')
    expect(sheet.querySelector('[data-testid="eule-situation"]')).not.toBeNull()
    expect(sheet.querySelector('[data-testid="eule-notes"]')).not.toBeNull()
  })

  it('names the stored situation in the chip', () => {
    setViewportWidth(1440)
    renderScreen({ situation: 'Wir sind verheiratet, zwei Kinder.\nHauskauf geplant.' })
    expect(screen.getByTestId('eule-situation-chip').textContent).toContain('Situation: Wir sind verheiratet, zwei Kinder.')
    expect(screen.getByTestId('eule-situation-chip').textContent).not.toContain('Hauskauf')
  })
})
