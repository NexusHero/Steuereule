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
    renderAdvisorChatPanel([], { onOpenConversation, isSending: true })
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
