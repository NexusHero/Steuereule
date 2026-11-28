import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { Text } from 'react-native'
import { renderAdvisorChatPanel } from '../../../test/test-advisor'
import { sendOptionsToDto } from './AdvisorChatPanel'

describe('the way into a spoken conversation (ADR-0115)', () => {
  it('is a button in the input that opens it', () => {
    const onOpenConversation = vi.fn()
    renderAdvisorChatPanel([], { onOpenConversation })
    const button = screen.getByTestId('advisor-conversation-open')
    expect(button.getAttribute('aria-label')).toBe('Mit der Eule sprechen')
    fireEvent.click(button)
    expect(onOpenConversation).toHaveBeenCalledOnce()
  })

  it('is absent where the chat cannot offer one', () => {
    renderAdvisorChatPanel()
    expect(screen.queryByTestId('advisor-conversation-open')).toBeNull()
  })

  it('cannot be opened while an answer is written', () => {
    const onOpenConversation = vi.fn()
    renderAdvisorChatPanel([], { onOpenConversation, stream: { isSending: true } })
    fireEvent.click(screen.getByTestId('advisor-conversation-open'))
    expect(onOpenConversation).not.toHaveBeenCalled()
  })

  it('draws the conversation over the page of the chat', () => {
    renderAdvisorChatPanel([], { variant: 'page', overlay: <Text testID="drueber">Gespräch</Text> })
    expect(screen.getByTestId('advisor-chat-panel').contains(screen.getByTestId('drueber'))).toBe(true)
  })

  it('a spoken message says so in the request, a typed one does not', () => {
    expect(sendOptionsToDto({ spoken: true })).toEqual({ spoken: true })
    expect(sendOptionsToDto({})).toEqual({})
    expect(sendOptionsToDto(undefined)).toEqual({})
  })
})

describe('what did not go to the model, in the user\'s own message (ADR-0091)', () => {
  const written = 'Meine IBAN ist DE89 3704, danke.'
  const message = (meta: object | null) => ({ id: 'u1', role: 'user' as const, content: written, meta, status: 'complete' as const, createdAt: '2026-11-28T08:00:00.000Z' })

  it('is struck through in the bubble, with a note under it', () => {
    renderAdvisorChatPanel([message({ masked: [{ start: 15, end: 24, as: '[IBAN-GESCHÜTZT]' }] }) as never])
    expect(screen.getByTestId('advisor-masked').textContent).toBe('DE89 3704')
    expect(screen.getByTestId('advisor-user-message').textContent).toBe(written)
    expect(screen.getByTestId('advisor-masked-note').textContent).toBe('Durchgestrichenes ging nicht an das Sprachmodell.')
  })

  it('a message that went out as written has no mark and no note', () => {
    renderAdvisorChatPanel([message(null) as never])
    expect(screen.getByTestId('advisor-user-message').textContent).toBe(written)
    expect(screen.queryByTestId('advisor-masked')).toBeNull()
    expect(screen.queryByTestId('advisor-masked-note')).toBeNull()
  })
})
