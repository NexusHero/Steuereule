// ADR-0101 §18: a booking the owl drafts is shown as a readable booking and taken over or undone like any draft.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { useTheme } from '@steuereule/ui'
import type { AdvisorActionProposal } from '@steuereule/core'
import { renderWithQuery } from '../../../test-render'
import { server } from '../../../test-msw-server'
import { BASE_PROFILE } from '../../business/businessTestKit'
import { makeStyles } from '../AdvisorChatPanel.styles'
import { ActionProposalCardView } from './ProposalCards'

const DRAFT = {
  date: '2025-03-01',
  documentNumber: 'RE-17',
  text: 'Druckerpapier',
  lines: [
    { account: '4930', side: 'debit', amount: 11900, taxKey: 'vst19' },
    { account: '1200', side: 'credit', amount: 11900 },
  ],
}

function action(overrides: Partial<AdvisorActionProposal> = {}, value: unknown = DRAFT): AdvisorActionProposal {
  return {
    actionId: 'act-b1',
    status: 'pending',
    screen: 'buchung',
    field: 'draft',
    instance: null,
    label: 'Buchung: Druckerpapier',
    previousValue: null,
    expectedPreviousValue: null,
    newValue: typeof value === 'string' ? value : JSON.stringify(value),
    beforeRefundEur: 0,
    afterRefundEur: 0,
    deltaEur: 0,
    reason: 'Aus der Rechnung gelesen.',
    sourceId: 'estg-4-3',
    paragraph: '§ 4 Abs. 3 EStG',
    ...overrides,
  } as AdvisorActionProposal
}

function Card(props: { readonly action: AdvisorActionProposal; readonly onApply?: () => void; readonly onUndo?: () => void }) {
  const styles = makeStyles(useTheme())
  return <ActionProposalCardView action={props.action} onSelectSource={vi.fn()} styles={styles} onApply={props.onApply} onUndo={props.onUndo} />
}

describe('the booking draft card', () => {
  beforeEach(() => {
    server.use(http.get('*/v1/steuerjahre/2025/selbststaendig', () => HttpResponse.json(BASE_PROFILE)))
  })

  it('shows date, text, account number and label, Soll/Haben, tax key and amount', async () => {
    renderWithQuery(<Card action={action()} />)
    expect(screen.getByTestId('buchung-entwurf-karte')).toBeTruthy()
    expect(screen.getByTestId('buchung-entwurf-kopf').textContent).toBe('01.03.2025 · Druckerpapier · RE-17')
    // The label comes with the book's chart (SKR03), once the profile has loaded.
    await waitFor(() => expect(screen.getByTestId('buchung-entwurf-zeile-0').textContent).toMatch(/^Soll · 4930 .+ · 119,00 € · Vorsteuer 19 %$/))
    expect(screen.getByTestId('buchung-entwurf-zeile-1').textContent).toMatch(/^Haben · 1200 .+ · 119,00 €$/)
  })

  it('takes the draft over and can undo it', () => {
    const onApply = vi.fn()
    const onUndo = vi.fn()
    const view = renderWithQuery(<Card action={action()} onApply={onApply} />)
    fireEvent.click(screen.getByTestId('buchung-entwurf-uebernehmen'))
    expect(onApply).toHaveBeenCalledWith('act-b1')
    view.unmount()
    renderWithQuery(<Card action={action({ status: 'applied' })} onUndo={onUndo} />)
    expect(screen.getByTestId('buchung-entwurf-gebucht')).toBeTruthy()
    fireEvent.click(screen.getByTestId('buchung-entwurf-rueckgaengig'))
    expect(onUndo).toHaveBeenCalledWith('act-b1')
  })

  it('says why a draft cannot be a booking (a regular payment without its year) and cannot be taken over', () => {
    renderWithQuery(<Card action={action({}, { ...DRAFT, regularPayment: { dueDate: '2025-01-05' } })} onApply={vi.fn()} />)
    expect(screen.getByTestId('buchung-entwurf-ungueltig').textContent).toContain('Fälligkeitsdatum und das Jahr')
    expect(screen.getByTestId('buchung-entwurf-uebernehmen').getAttribute('aria-disabled')).toBe('true')
  })
})
