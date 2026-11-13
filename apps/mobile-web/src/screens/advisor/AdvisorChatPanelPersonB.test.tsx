// ADR-0073: a draft for the spouse says whose it is, and applies and undoes like any other.
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import type { AdvisorActionProposal, AdvisorChatMessageView } from '@steuereule/core'
import { AdvisorChatPanel } from './AdvisorChatPanel'
import { renderInApp } from '../../test-render'

const draft = (over: Partial<AdvisorActionProposal>): AdvisorActionProposal => ({
  actionId: 'act-b',
  status: 'pending',
  screen: 'commute',
  field: 'oneWayKm',
  instance: null,
  label: 'Einfacher Arbeitsweg',
  previousValue: null,
  newValue: '24',
  beforeRefundEur: 0,
  afterRefundEur: 0,
  deltaEur: 0,
  reason: 'Entfernungspauschale.',
  sourceId: 'estg-9-1',
  ...over,
})

const answerWith = (...actions: AdvisorActionProposal[]): AdvisorChatMessageView[] => [
  { id: 'u1', role: 'user', content: 'Meine Frau fährt 24 km.', meta: null, createdAt: '2026-11-13T10:00:00Z' },
  { id: 'a1', role: 'assistant', content: 'Für Person B vorbereitet.', meta: { actions }, createdAt: '2026-11-13T10:00:01Z' },
]

describe('a draft for Person B on the card', () => {
  it('names the spouse by first name, and the user’s own draft names nobody', () => {
    renderInApp(<AdvisorChatPanel messages={answerWith(draft({ person: 'B' }), draft({ actionId: 'act-a', newValue: '12' }))} onSendMessage={vi.fn()} partnerName="Gülay" />)
    const badges = screen.getAllByTestId('advisor-action-person')
    expect(badges).toHaveLength(1)
    expect(badges[0]!.textContent).toBe('für Gülay')
  })

  it('says „Person B“ while the name is not known', () => {
    renderInApp(<AdvisorChatPanel messages={answerWith(draft({ person: 'B' }))} onSendMessage={vi.fn()} />)
    expect(screen.getByTestId('advisor-action-person').textContent).toBe('für Person B')
  })

  it('applies a pending B draft through the same button', () => {
    const onApplyAction = vi.fn()
    renderInApp(<AdvisorChatPanel messages={answerWith(draft({ person: 'B' }))} onSendMessage={vi.fn()} onApplyAction={onApplyAction} />)
    fireEvent.click(screen.getByTestId('advisor-action-apply-btn'))
    expect(onApplyAction).toHaveBeenCalledWith('act-b')
  })

  it('undoes an applied B draft through the same button', () => {
    const onUndoAction = vi.fn()
    renderInApp(<AdvisorChatPanel messages={answerWith(draft({ person: 'B', status: 'applied' }))} onSendMessage={vi.fn()} onUndoAction={onUndoAction} />)
    expect(screen.getByTestId('advisor-action-person').textContent).toBe('für Person B')
    fireEvent.click(screen.getByTestId('advisor-action-undo-btn'))
    expect(onUndoAction).toHaveBeenCalledWith('act-b')
  })
})
