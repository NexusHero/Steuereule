import { describe, expect, it } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import type { AdvisorActionProposal } from '@steuereule/core'
import { sendOptionsToDto } from './AdvisorChatPanel'
import { renderAdvisorChatPanel, sendChatMessage } from '../../../test/test-advisor'

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

describe('turbo mode (#491)', () => {
  it('is off at first: a message goes out without the flag', () => {
    const { onSendMessage } = renderAdvisorChatPanel()
    expect(screen.getByTestId('advisor-turbo-toggle').getAttribute('aria-checked')).toBe('false')
    sendChatMessage('Bitte 300 € Spenden eintragen')
    expect(onSendMessage).toHaveBeenCalledWith('Bitte 300 € Spenden eintragen')
  })

  it('sends the flag with every message once it is on, and stops when it is off again', () => {
    const { onSendMessage } = renderAdvisorChatPanel()
    fireEvent.click(screen.getByTestId('advisor-turbo-toggle'))
    expect(screen.getByTestId('advisor-turbo-toggle').getAttribute('aria-checked')).toBe('true')
    sendChatMessage('Bitte 300 € Spenden eintragen')
    expect(onSendMessage).toHaveBeenLastCalledWith('Bitte 300 € Spenden eintragen', { turbo: true })
    fireEvent.click(screen.getByTestId('advisor-turbo-toggle'))
    sendChatMessage('Danke')
    expect(onSendMessage).toHaveBeenLastCalledWith('Danke')
  })

  it('says under an answer what the owl applied itself', () => {
    renderAdvisorChatPanel([
      { id: 'u1', role: 'user', content: 'Bitte 300 € Spenden eintragen', meta: null, createdAt: '2026-11-12T10:00:00Z' },
      { id: 'a1', role: 'assistant', content: 'Erledigt.', meta: { action: APPLIED, turbo: true }, createdAt: '2026-11-12T10:00:01Z' },
    ])
    expect(screen.getByTestId('advisor-turbo-summary').textContent).toContain('1 Änderung direkt übernommen')
  })

  it('shows no turbo line under an answer the user applied by click', () => {
    renderAdvisorChatPanel([{ id: 'a1', role: 'assistant', content: 'Erledigt.', meta: { action: APPLIED }, createdAt: '2026-11-12T10:00:01Z' }])
    expect(screen.queryByTestId('advisor-turbo-summary')).toBeNull()
  })

  it('puts the flag into the request fields only when set', () => {
    expect(sendOptionsToDto({ turbo: true })).toEqual({ turbo: true })
    expect(sendOptionsToDto({ turbo: false })).toEqual({})
    expect(sendOptionsToDto(undefined)).toEqual({})
  })
})
