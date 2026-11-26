import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import type { AdvisorActionProposal, AdvisorChatMessageView } from '@steuereule/core'
import { renderInApp } from '../../../test/test-render'
import { OwlModeScreen } from './OwlModeScreen'

const NOW = '2026-11-14T10:00:00.000Z'
const CONVERSATIONS = [
  { id: 'c1', title: 'Fortbildung', createdAt: NOW, lastUsedAt: NOW },
  { id: 'c2', title: 'Homeoffice', createdAt: NOW, lastUsedAt: NOW },
]

const draft = (actionId: string, status: AdvisorActionProposal['status'] = 'pending'): AdvisorActionProposal => ({
  actionId,
  status,
  screen: 'interview',
  field: 'spenden',
  instance: null,
  label: `Entwurf ${actionId}`,
  previousValue: null,
  newValue: '100',
  beforeRefundEur: 0,
  afterRefundEur: 0,
  deltaEur: 0,
  reason: '',
  sourceId: 'estg-10b',
})

const answer = (id: string, meta: AdvisorChatMessageView['meta']): AdvisorChatMessageView => ({
  id,
  role: 'assistant',
  content: 'Antwort.',
  meta,
  createdAt: NOW,
  status: 'complete',
})

function setViewportWidth(width: number) {
  Object.defineProperty(document.documentElement, 'clientWidth', { value: width, configurable: true })
  window.dispatchEvent(new Event('resize'))
}

function renderScreen(props: Partial<Parameters<typeof OwlModeScreen>[0]> = {}) {
  return renderInApp(<OwlModeScreen taxYear={2026} initialCards={[]} {...props} />)
}

/** With drafts waiting, a wide screen may open the workbench by itself: press the pill only if it is still closed. */
function openWorkbenchIfClosed() {
  if (screen.getByTestId('eule-hints-pill').getAttribute('aria-expanded') !== 'true') fireEvent.click(screen.getByTestId('eule-hints-pill'))
}

const closeSheet = () => fireEvent.click(screen.getByTestId('sheet-schliessen'))

beforeEach(() => setViewportWidth(1440))
afterEach(() => setViewportWidth(0))

describe('every sheet of the owl closes again', () => {
  it('closes the privacy note, the settings and the session summary with their close button', () => {
    renderScreen({ onToggleOptIn: vi.fn(), optInEnabled: true })
    fireEvent.click(screen.getByTestId('eule-privacy-badge'))
    expect(screen.getByTestId('eule-privacy-sheet')).toBeDefined()
    closeSheet()
    expect(screen.queryByTestId('eule-privacy-sheet')).toBeNull()

    fireEvent.click(screen.getByTestId('eule-settings-btn'))
    expect(screen.getByTestId('eule-settings-sheet')).toBeDefined()
    closeSheet()
    expect(screen.queryByTestId('eule-settings-sheet')).toBeNull()

    fireEvent.click(screen.getByTestId('eule-session-summary-btn'))
    expect(screen.getByTestId('eule-session-summary-text').textContent).toContain('noch keine Änderungen')
    closeSheet()
    expect(screen.queryByTestId('eule-session-summary-sheet')).toBeNull()
  })

  it('counts what is done and what is open in the session summary', () => {
    renderScreen({ initialMessages: [answer('a1', { actions: [draft('d1', 'applied'), draft('d2')] })] })
    fireEvent.click(screen.getByTestId('eule-session-summary-btn'))
    const text = screen.getByTestId('eule-session-summary-text').textContent ?? ''
    expect(text).toContain('1 Änderung übernommen')
    expect(text).toContain('Entwurf d1')
    expect(text).toContain('1 Entwurf')
  })

  it('closes the situation dialog and the search', () => {
    renderScreen({
      conversations: CONVERSATIONS,
      activeConversationId: 'c1',
      onSelectConversation: vi.fn(),
      onNewConversation: vi.fn(),
      onSearchConversations: vi.fn().mockResolvedValue([]),
      situation: '',
      onSaveSituation: vi.fn(),
    })
    fireEvent.click(screen.getByTestId('eule-situation-chip'))
    expect(screen.getByTestId('eule-situation-sheet')).toBeDefined()
    closeSheet()
    expect(screen.queryByTestId('eule-situation-sheet')).toBeNull()

    fireEvent.click(screen.getByTestId('eule-conversation-search-open'))
    expect(screen.getByTestId('eule-search-sheet')).toBeDefined()
    closeSheet()
    expect(screen.queryByTestId('eule-search-sheet')).toBeNull()
  })

  it('opens another conversation from the search and closes it, but only closes it for the open one', async () => {
    const onSelectConversation = vi.fn()
    renderScreen({
      conversations: CONVERSATIONS,
      activeConversationId: 'c1',
      onSelectConversation,
      onNewConversation: vi.fn(),
      onSearchConversations: vi.fn().mockResolvedValue([
        { conversationId: 'c2', conversationTitle: 'Homeoffice', snippet: 'Arbeitszimmer', messageId: 'x', at: NOW },
        { conversationId: 'c1', conversationTitle: 'Fortbildung', snippet: 'Kurs', messageId: 'y', at: NOW },
      ]),
    })
    fireEvent.click(screen.getByTestId('eule-conversation-search-open'))
    fireEvent.change(screen.getByTestId('eule-conversation-search'), { target: { value: 'Arbeit' } })
    const hits = await screen.findAllByTestId('eule-conversation-search-hit')
    fireEvent.click(hits[0]!)
    expect(onSelectConversation).toHaveBeenCalledWith('c2')
    expect(screen.queryByTestId('eule-search-sheet')).toBeNull()

    fireEvent.click(screen.getByTestId('eule-conversation-search-open'))
    fireEvent.change(screen.getByTestId('eule-conversation-search'), { target: { value: 'Kurs' } })
    const again = await screen.findAllByTestId('eule-conversation-search-hit')
    onSelectConversation.mockClear()
    fireEvent.click(again[1]!)
    expect(onSelectConversation).not.toHaveBeenCalled()
    expect(screen.queryByTestId('eule-search-sheet')).toBeNull()
  })

  it('shows the connection, asks again and closes it', async () => {
    const onRecheckConnection = vi.fn().mockResolvedValue(undefined)
    renderScreen({ connection: { kind: 'offline' }, onRecheckConnection })
    fireEvent.click(screen.getByTestId('eule-connection-chip'))
    expect(screen.getByTestId('eule-connection-sheet')).toBeDefined()
    fireEvent.click(screen.getByTestId('eule-connection-recheck'))
    await waitFor(() => expect(onRecheckConnection).toHaveBeenCalledOnce())
    closeSheet()
    expect(screen.queryByTestId('eule-connection-sheet')).toBeNull()
  })

  it('asks again for a connection even where nothing can be rechecked', async () => {
    renderScreen({ connection: { kind: 'checking' } })
    fireEvent.click(screen.getByTestId('eule-connection-chip'))
    fireEvent.click(screen.getByTestId('eule-connection-recheck'))
    await waitFor(() => expect(screen.getByTestId('eule-connection-details')).toBeDefined())
  })

  it('shows no connection chip while none is known', () => {
    renderScreen()
    expect(screen.queryByTestId('eule-connection-chip')).toBeNull()
  })

  it('closes the workbench sheet over the chat on a tablet', () => {
    setViewportWidth(1024)
    renderScreen()
    fireEvent.click(screen.getByTestId('eule-hints-pill'))
    expect(screen.getByTestId('eule-workbench-sheet')).toBeDefined()
    closeSheet()
    expect(screen.queryByTestId('eule-workbench-sheet')).toBeNull()
  })

  it('hands a dismissed draft to whoever owns the screen', async () => {
    const onDismissAction = vi.fn().mockResolvedValue(undefined)
    renderScreen({ initialMessages: [answer('a1', { action: draft('d1') })], onDismissAction })
    fireEvent.click(screen.getByTestId('advisor-action-dismiss-btn'))
    await waitFor(() => expect(onDismissAction).toHaveBeenCalledWith('d1'))
  })

  it('regenerates the last answer on its own when the screen has no server behind it, replacing the old turn', async () => {
    renderScreen()
    fireEvent.change(screen.getByTestId('advisor-chat-input'), { target: { value: 'Was ist die Homeoffice-Pauschale?' } })
    fireEvent.click(screen.getByTestId('advisor-chat-send'))
    await screen.findByTestId('advisor-message-regenerate')
    const before = screen.getAllByText('Was ist die Homeoffice-Pauschale?').length
    fireEvent.click(screen.getByTestId('advisor-message-regenerate'))
    await waitFor(() => expect(screen.getAllByText('Was ist die Homeoffice-Pauschale?')).toHaveLength(before))
    expect(screen.getByTestId('advisor-message-regenerate')).toBeDefined()
  })

  it('applies every pending draft at once when they do not exclude each other', async () => {
    const onApplyAction = vi.fn().mockResolvedValue(undefined)
    renderScreen({
      initialMessages: [answer('a1', { actions: [draft('d1'), { ...draft('d2'), field: 'kirchensteuer' }] })],
      onApplyAction,
    })
    openWorkbenchIfClosed()
    fireEvent.click(await screen.findByTestId('eule-batch-apply-btn'))
    await waitFor(() => expect(onApplyAction).toHaveBeenCalledTimes(2))
  })

  it('says a recorded value is still there when a draft would add to it', () => {
    renderScreen({ initialMessages: [answer('a1', { action: { ...draft('d1'), combination: 'add' } })] })
    openWorkbenchIfClosed()
    expect(screen.getByTestId('eule-kombination-hinweis')).toBeDefined()
  })

  it('shows and hides the conversation sidebar on a wide screen', () => {
    renderScreen({ conversations: CONVERSATIONS, activeConversationId: 'c1', onSelectConversation: vi.fn(), onNewConversation: vi.fn() })
    expect(screen.getByTestId('eule-project-sidebar')).toBeDefined()
    fireEvent.click(screen.getByTestId('eule-conversations-btn'))
    expect(screen.queryByTestId('eule-project-sidebar')).toBeNull()
    fireEvent.click(screen.getByTestId('eule-conversations-btn'))
    expect(screen.getByTestId('eule-project-sidebar')).toBeDefined()
  })

  it('offers no situation chip and no conversations button without the data behind them', () => {
    renderScreen()
    expect(screen.queryByTestId('eule-situation-chip')).toBeNull()
    expect(screen.queryByTestId('eule-conversations-btn')).toBeNull()
  })
})
