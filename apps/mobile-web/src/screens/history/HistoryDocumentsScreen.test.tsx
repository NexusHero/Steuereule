// ADR-0099 §9 — „Unterlagen“ on its own page (`/app/verlauf/unterlagen`), against the `GET /v1/verlauf`
// wire with the mock's household: the Bescheide per year, each one viewed and downloaded through the stored
// Beleg, the weeks from the Abgabe to the Bescheid with „Nachfragen lohnt sich“ after twelve weeks, the
// Einsprüche with date, reason, outcome and amount, and the honest empty state.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderInApp } from '../../test-render'
import { server } from '../../test-msw-server'
import { EMPTY_HISTORY_RESPONSE, HISTORY_RESPONSE } from '../../test-history-fixture'
import { HistoryDocumentsScreen } from './HistoryDocumentsScreen'

const text = (id: string) => (screen.getByTestId(id).textContent ?? '').replace(/\u00a0/g, ' ')

function renderDocuments(language: 'de' | 'en' = 'de') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const handlers = { onBack: vi.fn() }
  renderInApp(
    <QueryClientProvider client={client}>
      <HistoryDocumentsScreen isGuest={false} {...handlers} />
    </QueryClientProvider>,
    { language },
  )
  return handlers
}

beforeEach(() => {
  server.use(http.get('*/v1/verlauf', () => HttpResponse.json(HISTORY_RESPONSE)))
})

describe('HistoryDocumentsScreen', () => {
  it('lists the Bescheide per year, newest first, and opens one in the Beleg preview with its download', async () => {
    const files: string[] = []
    server.use(
      http.get('*/v1/belege/:id/datei', ({ params }) => {
        files.push(String(params.id))
        return new HttpResponse(new Blob(['%PDF-1.4'], { type: 'application/pdf' }), { headers: { 'Content-Type': 'application/pdf' } })
      }),
    )
    const { onBack } = renderDocuments()
    expect(await screen.findByTestId('verlauf-unterlagen-titel')).toBeTruthy()
    const years = within(screen.getByTestId('verlauf-unterlagen-bescheide'))
      .getAllByTestId(/^verlauf-unterlagen-jahr-/)
      .map((e) => e.getAttribute('data-testid'))
    expect(years).toEqual(['verlauf-unterlagen-jahr-2024', 'verlauf-unterlagen-jahr-2023', 'verlauf-unterlagen-jahr-2022'])
    expect(text('verlauf-unterlagen-jahr-2024')).toContain('Bescheid_2024.pdf')
    expect(text('verlauf-unterlagen-jahr-2024')).toContain('hochgeladen 04.11.2026')
    expect(text('verlauf-unterlagen-jahr-2022')).toContain('kein Bescheid hochgeladen')
    expect(screen.getByRole('button', { name: 'Bescheid 2024 ansehen und herunterladen: Bescheid_2024.pdf' })).toBeTruthy()
    fireEvent.click(screen.getByTestId('verlauf-unterlagen-bescheid-bescheid-2024'))
    expect(await screen.findByTestId('receipt-file-modal')).toBeTruthy()
    expect(files).toEqual(['bescheid-2024'])
    fireEvent.click(screen.getByTestId('verlauf-unterlagen-zurueck'))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('says how long each Bescheid took, and after twelve weeks without one that asking is worth it', async () => {
    renderDocuments()
    await screen.findByTestId('verlauf-unterlagen-dauer')
    expect(text('verlauf-unterlagen-dauer-2024')).toBe('20246 Wochenabgegeben 21.09.2026 · Bescheid 02.11.2026')
    expect(text('verlauf-unterlagen-dauer-2025')).toBe('202513 Wochenabgegeben 14.08.2026 · noch kein BescheidNachfragen lohnt sich')
    expect(screen.queryByTestId('verlauf-unterlagen-nachfragen-2024')).toBeNull()
    expect(text('verlauf-unterlagen-dauer')).toContain('Dauert es länger als 12 Wochen, lohnt eine Nachfrage beim Finanzamt.')
  })

  it('shows the Einspruch history: year, outcome, amount, reason and the day it was lodged', async () => {
    renderDocuments()
    expect((await screen.findByTestId('verlauf-unterlagen-einspruch-2022-0')).textContent?.replace(/\u00a0/g, ' ')).toBe('2022+140 €Ein Betrag ist falsch · eingelegt 03.07.2023teilweise stattgegeben')
  })

  it('says honestly when there are no documents yet, and speaks English', async () => {
    server.use(http.get('*/v1/verlauf', () => HttpResponse.json(EMPTY_HISTORY_RESPONSE)))
    renderDocuments('en')
    expect(await screen.findByTestId('verlauf-unterlagen-leer')).toBeTruthy()
    expect(text('verlauf-unterlagen-titel')).toBe('Documents')
  })
})
