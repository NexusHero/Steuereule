import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import type { AdvisorChatMessageView } from '@steuereule/core'
import { AdvisorChatPanel, type AdvisorChatPanelProps } from './AdvisorChatPanel'
import { renderInApp } from '../../test-render'

const CHIPS = [{ label: 'Was hab ich vergessen?', testID: 'chip-forgotten' }]

function renderPanel(props: Partial<AdvisorChatPanelProps>) {
  return renderInApp(<AdvisorChatPanel messages={[]} quickChips={CHIPS} onSendMessage={vi.fn()} {...props} />)
}

const OPENING = { fingerprint: 'abcd1234', stage: 'ready' as const }
const placeholder: AdvisorChatMessageView = { id: 'u1', role: 'user', content: 'Neues Gespräch: Bitte eröffne …', meta: { opening: OPENING }, createdAt: '2026-11-13T10:00:00.000Z', status: 'complete' }
const opening: AdvisorChatMessageView = { id: 'a1', role: 'assistant', content: 'Dein Fall in Kürze.', meta: { opening: OPENING }, createdAt: '2026-11-13T10:00:05.000Z', status: 'complete' }

describe('AdvisorChatPanel: the owl opens the conversation (ADR-0067 §11)', () => {
  it('shows the opening but never the placeholder question behind it', () => {
    renderPanel({ messages: [placeholder, opening] })
    expect(screen.queryByTestId('advisor-user-message')).toBeNull()
    expect(screen.getByText('Dein Fall in Kürze.')).toBeTruthy()
  })

  it('does not show the placeholder while the opening is being written', () => {
    renderPanel({ messages: [], isSending: true, pendingUserMessage: placeholder })
    expect(screen.queryByTestId('advisor-user-message')).toBeNull()
  })

  it('offers to start the interview while nothing is entered', () => {
    const onSendMessage = vi.fn()
    renderPanel({ opening: { stage: 'empty' }, onSendMessage })
    fireEvent.click(screen.getByTestId('advisor-opening-start'))
    expect(onSendMessage).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ skill: 'berater-interview' }))
  })

  it('links to the last opening when nothing changed since', () => {
    const onOpenLast = vi.fn()
    renderPanel({ opening: { stage: 'ready', lastOpeningAt: '2026-11-13T09:00:00.000Z', onOpenLast } })
    const chip = screen.getByTestId('advisor-opening-last')
    expect(chip.textContent).toContain('13.11.2026')
    fireEvent.click(chip)
    expect(onOpenLast).toHaveBeenCalled()
  })

  it('shows neither chip once the conversation has messages', () => {
    renderPanel({ messages: [placeholder, opening], opening: { stage: 'empty' } })
    expect(screen.queryByTestId('advisor-opening-start')).toBeNull()
    expect(screen.queryByTestId('advisor-opening-last')).toBeNull()
  })
})
