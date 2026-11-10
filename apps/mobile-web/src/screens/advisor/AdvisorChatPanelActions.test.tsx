import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import type { AdvisorChatMessageView } from '@steuereule/core'
import { createAppI18n } from '../../i18n/app-i18n'
import { AdvisorChatPanel, type AdvisorChatPanelProps } from './AdvisorChatPanel'

const TURN: AdvisorChatMessageView[] = [
  { id: 'u1', role: 'user', content: 'Was ist mit Spenden?', meta: null, createdAt: '2026-11-10T10:00:00Z' },
  { id: 'a1', role: 'assistant', content: '**Spenden** sind abziehbar nach [estg-10b].', meta: null, createdAt: '2026-11-10T10:00:01Z' },
  { id: 'u2', role: 'user', content: 'Und 300 €?', meta: null, createdAt: '2026-11-10T10:01:00Z' },
  { id: 'a2', role: 'assistant', content: 'Ja, 300 € gehen.', meta: null, createdAt: '2026-11-10T10:01:01Z' },
]

function renderPanel(props: Partial<AdvisorChatPanelProps>) {
  const onSendMessage = vi.fn()
  render(
    <I18nextProvider i18n={createAppI18n('de')}>
      <ThemeProvider mode="light">
        <AdvisorChatPanel messages={TURN} onSendMessage={onSendMessage} {...props} />
      </ThemeProvider>
    </I18nextProvider>,
  )
  return { onSendMessage }
}

afterEach(() => vi.unstubAllGlobals())

describe('chat basics (#451 slice 1b)', () => {
  it('renders assistant answers as Markdown and user messages as plain text', () => {
    renderPanel({ messages: [{ ...TURN[0]!, content: '**nicht fett**' }, TURN[1]!] })
    expect(screen.getAllByTestId('advisor-user-message')[0]!.textContent).toBe('**nicht fett**')
    const answer = screen.getAllByTestId('advisor-assistant-message')[0]!
    expect(answer.textContent).toContain('Spenden')
    expect(answer.textContent).not.toContain('**')
    expect(screen.getByTestId('law-chip-estg-10b')).toBeTruthy()
  })

  it('copies an answer with citations spelled out and confirms „Kopiert“', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    renderPanel({})
    const copyButtons = screen.getAllByTestId('advisor-message-copy')
    expect(copyButtons).toHaveLength(2)
    expect(copyButtons[0]!.getAttribute('aria-label')).toBe('Antwort der Eule kopieren')
    await act(async () => {
      fireEvent.click(copyButtons[0]!)
    })
    expect(writeText).toHaveBeenCalledWith('**Spenden** sind abziehbar nach (§ 10b EStG).')
    await waitFor(() => expect(copyButtons[0]!.textContent).toBe('Kopiert'))
  })

  it('offers „Neu generieren“ only on the latest answer and re-sends the latest question replacing its turn', () => {
    const { onSendMessage } = renderPanel({})
    const regenerate = screen.getAllByTestId('advisor-message-regenerate')
    expect(regenerate).toHaveLength(1)
    fireEvent.click(regenerate[0]!)
    expect(onSendMessage).toHaveBeenCalledWith('Und 300 €?', { replaceFromMessageId: 'u2' })
  })

  it('edits the latest question and resends it, replacing the answer after it', () => {
    const { onSendMessage } = renderPanel({})
    const edit = screen.getAllByTestId('advisor-message-edit')
    expect(edit).toHaveLength(1)
    fireEvent.click(edit[0]!)
    const input = screen.getByTestId('advisor-chat-input') as HTMLTextAreaElement
    expect(input.value).toBe('Und 300 €?')
    expect(screen.getByTestId('advisor-edit-banner')).toBeTruthy()
    fireEvent.change(input, { target: { value: 'Und 350 €?' } })
    fireEvent.click(screen.getByTestId('advisor-chat-send'))
    expect(onSendMessage).toHaveBeenCalledWith('Und 350 €?', { replaceFromMessageId: 'u2' })
    expect(screen.queryByTestId('advisor-edit-banner')).toBeNull()
  })

  it('cancelling an edit sends nothing and clears the field', () => {
    const { onSendMessage } = renderPanel({})
    fireEvent.click(screen.getByTestId('advisor-message-edit'))
    fireEvent.click(screen.getByTestId('advisor-edit-cancel'))
    expect((screen.getByTestId('advisor-chat-input') as HTMLTextAreaElement).value).toBe('')
    expect(onSendMessage).not.toHaveBeenCalled()
  })

  it('hides regenerate and edit while an answer is running', () => {
    renderPanel({ isSending: true })
    expect(screen.queryByTestId('advisor-message-regenerate')).toBeNull()
    expect(screen.queryByTestId('advisor-message-edit')).toBeNull()
  })
})
