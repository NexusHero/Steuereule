import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import type { AdvisorActionProposal, AdvisorChatMessageView } from '@steuereule/core'
import { createAppI18n } from '../../i18n/app-i18n'
import { AdvisorChatPanel, type AdvisorChatPanelProps } from './AdvisorChatPanel'

function renderPanel(props: Partial<AdvisorChatPanelProps>) {
  return render(
    <I18nextProvider i18n={createAppI18n('de')}>
      <ThemeProvider mode="light">
        <AdvisorChatPanel messages={[]} onSendMessage={vi.fn()} {...props} />
      </ThemeProvider>
    </I18nextProvider>,
  )
}

const user = (id: string, content: string): AdvisorChatMessageView => ({ id, role: 'user', content, meta: null, createdAt: '2026-11-11T10:00:00.000Z', status: 'complete' })
const owl = (id: string, content: string, extra: Partial<AdvisorChatMessageView> = {}): AdvisorChatMessageView => ({
  id, role: 'assistant', content, meta: null, createdAt: '2026-11-11T10:00:01.000Z', status: 'complete', ...extra,
})

describe('AdvisorChatPanel: stored message states (#476 decision 7)', () => {
  it('shows a stored aborted answer with its partial text, marked, and replaces the turn on retry', () => {
    const onSendMessage = vi.fn()
    renderPanel({ messages: [user('u1', 'Homeoffice?'), owl('a1', 'Du kannst bis zu', { status: 'aborted' })], onSendMessage })
    const bubble = screen.getByTestId('advisor-message-aborted')
    expect(bubble.textContent).toContain('Du kannst bis zu')
    expect(bubble.textContent).toContain('abgebrochen')
    expect(screen.queryByTestId('advisor-assistant-message')).toBeNull()

    fireEvent.click(screen.getByTestId('advisor-retry'))
    expect(onSendMessage).toHaveBeenCalledWith('Homeoffice?', { replaceFromMessageId: 'u1' })
  })

  it('does not show the stopped answer twice once the stored one has arrived', () => {
    renderPanel({
      messages: [user('u1', 'Homeoffice?'), owl('a1', 'Du kannst bis zu', { status: 'aborted' })],
      abortedTurn: { question: 'Homeoffice?', partialText: 'Du kannst bis zu' },
    })
    expect(screen.getAllByTestId('advisor-message-aborted')).toHaveLength(1)
  })

  it('marks a failed answer as not finished and offers to ask again', () => {
    const onSendMessage = vi.fn()
    renderPanel({ messages: [user('u1', 'Frage'), owl('a1', 'halb', { status: 'failed' })], onSendMessage })
    const bubble = screen.getByTestId('advisor-message-failed')
    expect(bubble.textContent).toContain('nicht fertig geworden')
    expect(bubble.textContent).toContain('halb')
    fireEvent.click(screen.getByTestId('advisor-retry'))
    expect(onSendMessage).toHaveBeenCalledWith('Frage', { replaceFromMessageId: 'u1' })
  })

  it('offers neither rating nor regenerate on an answer that was cut off', () => {
    renderPanel({ messages: [user('u1', 'Frage'), owl('a1', 'halb', { status: 'aborted' })], onRateMessage: vi.fn() })
    expect(screen.queryByTestId('advisor-feedback')).toBeNull()
    expect(screen.queryByTestId('advisor-message-regenerate')).toBeNull()
  })

  it('offers retry only on the latest turn, not on an old interrupted one', () => {
    renderPanel({
      messages: [user('u1', 'Alt'), owl('a1', 'halb', { status: 'aborted' }), user('u2', 'Neu'), owl('a2', 'Fertig.')],
    })
    expect(screen.getByTestId('advisor-message-aborted')).toBeTruthy()
    expect(screen.queryByTestId('advisor-retry')).toBeNull()
  })

  it('leaves a stored answer that is still being written to the live bubble', () => {
    renderPanel({
      messages: [user('u1', 'Frage'), owl('a1', '', { status: 'streaming', runId: 'run-1' })],
      isSending: true,
      streamedText: 'Ich schreibe gerade',
    })
    expect(screen.queryByTestId('advisor-assistant-message')).toBeNull()
    expect(screen.getByTestId('advisor-streaming-message').textContent).toContain('Ich schreibe gerade')
  })
})

describe('AdvisorChatPanel: the running turn (#476)', () => {
  it('shows the question at once, before the stored conversation has it', () => {
    renderPanel({ isSending: true, pendingUserMessage: user('u9', 'Lohnt sich mein Arbeitsweg?') })
    expect(screen.getAllByTestId('advisor-user-message').map((n) => n.textContent)).toEqual(['Lohnt sich mein Arbeitsweg?'])
  })

  it('does not repeat the question once the stored conversation has it', () => {
    renderPanel({ isSending: true, messages: [user('u9', 'Lohnt sich mein Arbeitsweg?')], pendingUserMessage: user('u9', 'Lohnt sich mein Arbeitsweg?') })
    expect(screen.getAllByTestId('advisor-user-message')).toHaveLength(1)
  })

  it('shows the line of thought live above the growing answer, apart from it', () => {
    renderPanel({
      isSending: true,
      streamSteps: ['Prüfe Akte …', 'Simuliere …'],
      streamedReasoning: 'Erst die Pauschale prüfen.',
      streamedText: 'Ja, das lohnt sich.',
    })
    expect(screen.getByTestId('advisor-thought-reasoning').textContent).toBe('Erst die Pauschale prüfen.')
    expect(screen.getByTestId('advisor-streaming-message').textContent).toContain('Ja, das lohnt sich.')
    expect(screen.getByTestId('advisor-streaming-message').textContent).not.toContain('Erst die Pauschale')
  })

  it('shows reasoning that arrives before the first word of the answer', () => {
    renderPanel({ isSending: true, streamedReasoning: 'Ich schaue in die Akte.' })
    expect(screen.getByTestId('advisor-thought-reasoning').textContent).toBe('Ich schaue in die Akte.')
    expect(screen.getByTestId('advisor-thinking')).toBeTruthy()
  })

  it('says when the connection is being restored', () => {
    renderPanel({ isSending: true, reconnecting: true, streamedText: 'Bis zu ' })
    expect(screen.getByTestId('advisor-reconnecting').textContent).toContain('Verbindung wird wiederhergestellt')
  })
})

describe('AdvisorChatPanel: line of thought and rating on stored answers (#476)', () => {
  it('keeps the line of thought with the answer, collapsed', () => {
    renderPanel({
      messages: [user('u1', 'Frage'), owl('a1', 'Antwort.', { reasoning: 'Erst die Pauschale prüfen.', meta: { steps: ['Prüfe Akte …', 'Simuliere …'] } })],
    })
    expect(screen.getByTestId('advisor-thought-toggle').textContent).toContain('Gedankengang · 2 Schritte')
    expect(screen.queryByTestId('advisor-thought-body')).toBeNull()
    fireEvent.click(screen.getByTestId('advisor-thought-toggle'))
    expect(screen.getByTestId('advisor-thought-reasoning').textContent).toBe('Erst die Pauschale prüfen.')
  })

  it('rates a finished answer and shows the stored rating', () => {
    const onRateMessage = vi.fn()
    renderPanel({
      messages: [user('u1', 'Frage'), owl('a1', 'Antwort.', { feedback: { rating: 'down', reason: 'unklar' } })],
      onRateMessage,
    })
    expect(screen.getByTestId('advisor-feedback-down').getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByTestId('advisor-feedback-up'))
    expect(onRateMessage).toHaveBeenCalledWith('a1', 'up', undefined)
  })

  it('offers no rating where the chat cannot store one', () => {
    renderPanel({ messages: [user('u1', 'Frage'), owl('a1', 'Antwort.')] })
    expect(screen.queryByTestId('advisor-feedback')).toBeNull()
  })
})

describe('AdvisorChatPanel: several drafts in one answer (ADR-0065)', () => {
  const draft = (actionId: string, label: string, newValue: string): AdvisorActionProposal => ({
    actionId, status: 'pending', screen: 'commute', field: `f-${actionId}`, instance: null, label,
    previousValue: null, newValue, beforeRefundEur: 0, afterRefundEur: 0, deltaEur: 0, reason: 'vom Nutzer genannt',
    sourceId: 'estg-9' as AdvisorActionProposal['sourceId'],
  })

  it('shows one card per draft, each applied on its own', () => {
    const onApplyAction = vi.fn()
    renderPanel({
      messages: [user('u1', 'Drei Dinge'), owl('a1', 'Drei Entwürfe.', { meta: { actions: [draft('d1', 'Homeoffice-Tage', '30'), draft('d2', 'Handwerkerkosten', '5000'), draft('d3', 'Spenden', '200')] } })],
      onApplyAction,
    })
    const cards = screen.getAllByTestId('advisor-action-card')
    expect(cards).toHaveLength(3)
    expect(cards.map((c) => c.textContent).join(' ')).toContain('Handwerkerkosten')
    fireEvent.click(screen.getAllByTestId('advisor-action-apply-btn')[1]!)
    expect(onApplyAction).toHaveBeenCalledWith('d2')
  })

  it('says what could not be prepared, with the reason', () => {
    renderPanel({
      messages: [user('u1', 'Miete 9600'), owl('a1', 'Ich habe es vorbereitet.', { meta: { notStaged: [{ label: 'Mieteinnahmen', reason: 'Es gibt noch kein Vermietungsobjekt.' }] } })],
    })
    const notice = screen.getByTestId('advisor-not-staged')
    expect(notice.textContent).toContain('Nicht vorbereitet')
    expect(notice.textContent).toContain('Mieteinnahmen: Es gibt noch kein Vermietungsobjekt.')
  })

  it('offers the way into the mask when a record has to be created first', () => {
    const onInspectMask = vi.fn()
    renderPanel({
      messages: [user('u1', 'Miete 9600'), owl('a1', 'Lege das Objekt bitte an.', { meta: { notStaged: [{ label: 'Mieteinnahmen', reason: 'Es ist noch kein Vermietungsobjekt angelegt.', screen: 'vermietung' }] } })],
      onInspectMask,
    })
    fireEvent.click(screen.getByTestId('advisor-not-staged-open-mask'))
    expect(onInspectMask).toHaveBeenCalledWith('vermietung')
  })

  it('keeps the scanned certificate in its own review card', () => {
    renderPanel({
      messages: [owl('a1', 'Erkannt.', { meta: { lstbScan: {} as NonNullable<AdvisorChatMessageView['meta']>['lstbScan'], actions: [draft('d1', 'Bruttolohn', '62000')] } })],
    })
    expect(screen.getByTestId('advisor-lstb-scan-card')).toBeTruthy()
    expect(screen.queryByTestId('advisor-action-card')).toBeNull()
  })
})
