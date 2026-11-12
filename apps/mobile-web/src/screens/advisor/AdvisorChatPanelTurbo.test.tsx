import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import type { AdvisorActionProposal, AdvisorChatMessageView } from '@steuereule/core'
import { AdvisorChatPanel, sendOptionsToDto } from './AdvisorChatPanel'
import { renderInApp } from '../../test-render'

const APPLIED: AdvisorActionProposal = {
  actionId: 'act-1',
  status: 'applied',
  screen: 'interview',
  field: 'spenden-betrag',
  instance: null,
  label: 'Spenden',
  previousValue: '100',
  newValue: '300',
  beforeRefundEur: 0,
  afterRefundEur: 0,
  deltaEur: 0,
  reason: 'Test',
  sourceId: 'estg-10b',
}

function renderPanel(messages: AdvisorChatMessageView[] = []) {
  const onSendMessage = vi.fn()
  renderInApp(<AdvisorChatPanel messages={messages} onSendMessage={onSendMessage} />)
  return { onSendMessage }
}

function send(text: string) {
  fireEvent.change(screen.getByTestId('advisor-chat-input'), { target: { value: text } })
  fireEvent.click(screen.getByTestId('advisor-chat-send'))
}

describe('turbo mode (#491)', () => {
  it('is off at first: a message goes out without the flag', () => {
    const { onSendMessage } = renderPanel()
    expect(screen.getByTestId('advisor-turbo-toggle').getAttribute('aria-checked')).toBe('false')
    send('Bitte 300 € Spenden eintragen')
    expect(onSendMessage).toHaveBeenCalledWith('Bitte 300 € Spenden eintragen')
  })

  it('sends the flag with every message once it is on, and stops when it is off again', () => {
    const { onSendMessage } = renderPanel()
    fireEvent.click(screen.getByTestId('advisor-turbo-toggle'))
    expect(screen.getByTestId('advisor-turbo-toggle').getAttribute('aria-checked')).toBe('true')
    send('Bitte 300 € Spenden eintragen')
    expect(onSendMessage).toHaveBeenLastCalledWith('Bitte 300 € Spenden eintragen', { turbo: true })
    fireEvent.click(screen.getByTestId('advisor-turbo-toggle'))
    send('Danke')
    expect(onSendMessage).toHaveBeenLastCalledWith('Danke')
  })

  it('says under an answer what the owl applied itself', () => {
    renderPanel([
      { id: 'u1', role: 'user', content: 'Bitte 300 € Spenden eintragen', meta: null, createdAt: '2026-11-12T10:00:00Z' },
      { id: 'a1', role: 'assistant', content: 'Erledigt.', meta: { action: APPLIED, turbo: true }, createdAt: '2026-11-12T10:00:01Z' },
    ])
    expect(screen.getByTestId('advisor-turbo-summary').textContent).toContain('1 Änderung direkt übernommen')
  })

  it('shows no turbo line under an answer the user applied by click', () => {
    renderPanel([{ id: 'a1', role: 'assistant', content: 'Erledigt.', meta: { action: APPLIED }, createdAt: '2026-11-12T10:00:01Z' }])
    expect(screen.queryByTestId('advisor-turbo-summary')).toBeNull()
  })

  it('puts the flag into the request fields only when set', () => {
    expect(sendOptionsToDto({ turbo: true })).toEqual({ turbo: true })
    expect(sendOptionsToDto({ turbo: false })).toEqual({})
    expect(sendOptionsToDto(undefined)).toEqual({})
  })
})
