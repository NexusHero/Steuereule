import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { useTheme } from '@steuereule/ui'
import type { AdvisorActionProposal } from '@steuereule/core'
import { renderInApp } from '../../../test-render'
import { server } from '../../../test-msw-server'
import { BASE_PROFILE } from '../../business/businessTestKit'
import { makeStyles } from '../AdvisorChatPanel.styles'
import { BookingDraftCard } from './BookingDraftCard'

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
    newValue: JSON.stringify(value),
    beforeRefundEur: 0,
    afterRefundEur: 0,
    deltaEur: 0,
    reason: 'Aus der Rechnung gelesen.',
    sourceId: 'estg-4-3',
    paragraph: '§ 4 Abs. 3 EStG',
    ...overrides,
  } as AdvisorActionProposal
}

type Handler = (actionId: string) => Promise<void> | void

function Card(props: { readonly action: AdvisorActionProposal; readonly onApply?: Handler; readonly onUndo?: Handler; readonly onDismiss?: Handler }) {
  const styles = makeStyles(useTheme())
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <BookingDraftCard action={props.action} onApply={props.onApply} onUndo={props.onUndo} onDismiss={props.onDismiss} styles={styles} />
    </QueryClientProvider>
  )
}

describe('the booking draft card in its other states', () => {
  beforeEach(() => {
    server.use(http.get('*/v1/steuerjahre/2025/selbststaendig', () => HttpResponse.json(BASE_PROFILE)))
  })

  it('lets the user dismiss a pending draft', async () => {
    const onDismiss = vi.fn()
    renderInApp(<Card action={action()} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByTestId('buchung-entwurf-verwerfen'))
    await waitFor(() => expect(onDismiss).toHaveBeenCalledWith('act-b1'))
  })

  it('offers no dismissal once the draft is not pending any more', () => {
    renderInApp(<Card action={action({ status: 'applied' })} onDismiss={vi.fn()} />)
    expect(screen.queryByTestId('buchung-entwurf-verwerfen')).toBeNull()
  })

  it('says a dismissed draft was dismissed and a replaced one was replaced, with nothing to press', () => {
    const dismissed = renderInApp(<Card action={action({ status: 'dismissed' })} onApply={vi.fn()} />)
    expect(screen.getByText('Verworfen')).toBeDefined()
    expect(screen.queryByTestId('buchung-entwurf-uebernehmen')).toBeNull()
    dismissed.unmount()
    renderInApp(<Card action={action({ status: 'superseded' })} onApply={vi.fn()} />)
    expect(screen.getByText('Ersetzt durch neueren Entwurf')).toBeDefined()
    expect(screen.queryByTestId('buchung-entwurf-uebernehmen')).toBeNull()
  })

  it('shows a booked draft without an undo when none is offered', () => {
    renderInApp(<Card action={action({ status: 'applied' })} />)
    expect(screen.getByTestId('buchung-entwurf-gebucht')).toBeDefined()
    expect(screen.queryByTestId('buchung-entwurf-rueckgaengig')).toBeNull()
  })

  it('shows the reason the booking was refused, in the words of the refusal', async () => {
    const onApply = vi.fn().mockRejectedValue(new Error('Der Zeitraum ist gesperrt.'))
    renderInApp(<Card action={action()} onApply={onApply} />)
    fireEvent.click(screen.getByTestId('buchung-entwurf-uebernehmen'))
    expect((await screen.findByTestId('buchung-entwurf-fehler')).textContent).toBe('Der Zeitraum ist gesperrt.')
  })

  it('falls back to a plain message when the refusal has no words, and clears it on the next try', async () => {
    const onApply = vi.fn().mockRejectedValueOnce('kaputt').mockResolvedValueOnce(undefined)
    renderInApp(<Card action={action()} onApply={onApply} />)
    fireEvent.click(screen.getByTestId('buchung-entwurf-uebernehmen'))
    expect((await screen.findByTestId('buchung-entwurf-fehler')).textContent).toContain('Der Vorschlag konnte nicht übernommen werden')
    fireEvent.click(screen.getByTestId('buchung-entwurf-uebernehmen'))
    await waitFor(() => expect(screen.queryByTestId('buchung-entwurf-fehler')).toBeNull())
  })

  it('presses nothing while a handler is missing or the draft is not a booking', () => {
    renderInApp(<Card action={action()} />)
    fireEvent.click(screen.getByTestId('buchung-entwurf-uebernehmen'))
    expect(screen.queryByTestId('buchung-entwurf-fehler')).toBeNull()
  })

  it('writes an account without a known label and a line without a tax key plainly', () => {
    server.use(http.get('*/v1/steuerjahre/2025/selbststaendig', () => HttpResponse.json({ message: 'down' }, { status: 500 })))
    renderInApp(<Card action={action()} />)
    expect(screen.getByTestId('buchung-entwurf-zeile-1').textContent).toMatch(/^Haben · 1200 · 119,00\s€$/)
    expect(screen.getByTestId('buchung-entwurf-zeile-0').textContent).toMatch(/^Soll · 4930 · 119,00\s€ · Vorsteuer 19\s%$/)
  })

  it('does not ask for a chart when the draft is not a booking', () => {
    let asked = false
    server.use(
      http.get('*/v1/steuerjahre/:jahr/selbststaendig', () => {
        asked = true
        return HttpResponse.json(BASE_PROFILE)
      }),
    )
    renderInApp(<Card action={{ ...action(), newValue: 'kein json' }} />)
    expect(screen.getByTestId('buchung-entwurf-ungueltig')).toBeDefined()
    expect(asked).toBe(false)
  })
})
