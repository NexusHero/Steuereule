import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { AdvisorChatPanel, type AdvisorChatPanelProps } from './AdvisorChatPanel'
import { renderInApp } from '../../test-render'

function renderPanel(props: Partial<AdvisorChatPanelProps>) {
  return renderInApp(<AdvisorChatPanel messages={[]} onSendMessage={vi.fn()} {...props} />)
}

describe('AdvisorChatPanel live answer (#451 slice 1)', () => {
  it('shows the thinking owl with a server step before the first token', () => {
    renderPanel({ isSending: true, streamSteps: ['Prüfe EStG-Paragraph …'] })
    expect(screen.getByTestId('advisor-thinking')).toBeTruthy()
    expect(screen.getByTestId('eule-thinking-phrase').textContent).toBe('Prüfe EStG-Paragraph …')
    // Announced once through a polite live region, not on every phrase.
    expect(screen.getByTestId('advisor-thinking-status').getAttribute('aria-live')).toBe('polite')
    expect(screen.getByTestId('eule-thinking-phrase').getAttribute('aria-hidden')).toBe('true')
  })

  it('grows the answer inside the assistant bubble once tokens arrive', () => {
    renderPanel({ isSending: true, streamedText: 'Du kannst bis zu 1.260 € ' })
    expect(screen.getByTestId('advisor-streaming-message').textContent).toContain('Du kannst bis zu 1.260 €')
    expect(screen.queryByTestId('advisor-thinking')).toBeNull()
  })

  it('offers Stop only while answering and only when the chat can stop', () => {
    const onStop = vi.fn()
    renderPanel({ isSending: true, onStop })
    fireEvent.click(screen.getByTestId('advisor-chat-stop'))
    expect(onStop).toHaveBeenCalled()
  })

  it('has no Stop where the chat cannot stop (non-streaming companion)', () => {
    renderPanel({ isSending: true })
    expect(screen.queryByTestId('advisor-chat-stop')).toBeNull()
  })

  it('keeps a stopped answer marked as aborted and asks again on retry', () => {
    const onSendMessage = vi.fn()
    renderPanel({ abortedTurn: { question: 'Homeoffice?', partialText: 'Du kannst bis zu' }, onSendMessage })
    const bubble = screen.getByTestId('advisor-message-aborted')
    expect(bubble.textContent).toContain('Du kannst bis zu')
    expect(bubble.textContent).toContain('abgebrochen')
    expect(screen.queryByTestId('advisor-action-card')).toBeNull()
    fireEvent.click(screen.getByTestId('advisor-retry'))
    expect(onSendMessage).toHaveBeenCalledWith('Homeoffice?')
  })
})
