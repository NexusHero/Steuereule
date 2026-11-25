// The Veranlagungsartenvergleich around its verdicts: the way back, the embedded form, the loading
// and error states with a retry, the "no income yet" gate and rejecting a nonsensical partner income.
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { FilingTypeComparisonScreen, type FilingTypeComparisonScreenProps } from './FilingTypeComparisonScreen'
import { server } from '../../test-msw-server'
import { renderWithQuery } from '../../test-render'

const URL_COMPARISON = '*/v1/steuerjahre/2026/veranlagungsartenvergleich'

function renderScreen(props: FilingTypeComparisonScreenProps = {}) {
  return renderWithQuery(<FilingTypeComparisonScreen taxYear={2026} {...props} />)
}

const married = (zveB: string) => {
  fireEvent.click(screen.getByTestId('verheiratet-ja'))
  fireEvent.change(screen.getByTestId('zveb-input'), { target: { value: zveB } })
}

describe('FilingTypeComparisonScreen', () => {
  it('goes back from the header, and leaves a single person without a request', async () => {
    let requested = false
    server.use(http.get(URL_COMPARISON, () => ((requested = true), HttpResponse.json(null))))
    const onBack = vi.fn()
    renderScreen({ onBack })
    fireEvent.click(screen.getByLabelText('Zurück'))
    expect(onBack).toHaveBeenCalledOnce()
    expect(screen.getByText('Nur Verheiratete können zwischen Einzel- und Zusammenveranlagung wählen.')).toBeTruthy()
    await new Promise((r) => setTimeout(r, 30))
    expect(requested).toBe(false)
  })

  it('lets the user switch back to „Nein“ after saying „Ja“', () => {
    renderScreen()
    fireEvent.click(screen.getByTestId('verheiratet-ja'))
    expect(screen.getByTestId('zveb-input')).toBeTruthy()
    fireEvent.click(screen.getByTestId('verheiratet-nein'))
    expect(screen.queryByTestId('zveb-input')).toBeNull()
  })

  it('shows a loading state, then says there is nothing to compare without income', async () => {
    server.use(http.get(URL_COMPARISON, () => HttpResponse.json({ kind: 'nicht-anwendbar', reason: 'keine-einnahmen' })))
    renderScreen()
    married('0')
    expect(await screen.findByText('Noch kein Einkommen erfasst — es gibt nichts zu vergleichen.')).toBeTruthy()
  })

  it('says the comparison does not apply when the server says the user is not married', async () => {
    server.use(http.get(URL_COMPARISON, () => HttpResponse.json({ kind: 'nicht-anwendbar', reason: 'nicht-verheiratet' })))
    renderScreen()
    married('100')
    await waitFor(() => expect(screen.getAllByText('Nur Verheiratete können zwischen Einzel- und Zusammenveranlagung wählen.').length).toBeGreaterThan(0))
  })

  it('shows an honest error and calculates again on retry', async () => {
    let healthy = false
    server.use(
      http.get(URL_COMPARISON, () =>
        healthy
          ? HttpResponse.json({ kind: 'eindeutig', recommendation: 'einzel', single: 10, joint: 20, delta: 10, uncertainty: { kind: 'bestimmt', upperLimit: 0 }, provenance: { zveA: 1, zveB: 2, components: [] } })
          : HttpResponse.json(null, { status: 500 }),
      ),
    )
    renderScreen()
    married('500')
    expect(await screen.findByText('Der Vergleich konnte nicht berechnet werden. Prüf die Verbindung und versuch es noch mal.')).toBeTruthy()
    healthy = true
    fireEvent.click(screen.getByText('Noch mal versuchen'))
    expect(await screen.findByText('Einzelveranlagung ist günstiger.')).toBeTruthy()
  })

  it('asks nothing of the server for a negative or non-numeric partner income', async () => {
    let requested = 0
    server.use(http.get(URL_COMPARISON, () => (requested++, HttpResponse.json(null))))
    renderScreen()
    married('-5')
    await new Promise((r) => setTimeout(r, 30))
    fireEvent.change(screen.getByTestId('zveb-input'), { target: { value: 'abc' } })
    await new Promise((r) => setTimeout(r, 30))
    expect(requested).toBe(0)
  })

  it('renders without the header and the back arrow when embedded, and still offers „weiter“', () => {
    const onDone = vi.fn()
    renderScreen({ embedded: true, onDone, onBack: vi.fn() })
    expect(screen.queryByLabelText('Zurück')).toBeNull()
    expect(screen.queryByTestId('screen-container')).toBeNull()
    fireEvent.click(screen.getByTestId('veranlagungsartenvergleich-weiter'))
    expect(onDone).toHaveBeenCalledOnce()
  })
})
