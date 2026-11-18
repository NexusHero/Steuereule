// ADR-0098 §1, §8 — one year of the Verlauf on its own page, against the `GET /v1/verlauf` wire with the
// mock's example household: one sentence on where the year stands, then by its kind the Bescheid-Abgleich
// with the deadline and „Fürs nächste Mal“, both Abgleiche of two single returns, the waiting year's
// positions without an amount, what an open year lacks (concretely), and the honest „nur Bescheid“.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderInApp } from '../../test-render'
import { server } from '../../test-msw-server'
import { HISTORY_RESPONSE } from '../../test-history-fixture'
import { HistoryYearScreen } from './HistoryYearScreen'

const text = (id: string) => (screen.getByTestId(id).textContent ?? '').replace(/ /g, ' ')
const found = async (id: string) => {
  await screen.findByTestId(id)
  return text(id)
}

function renderYear(year: number, language: 'de' | 'en' = 'de') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const handlers = { onBack: vi.fn(), onOpenYear: vi.fn(), onPrepareAppeal: vi.fn() }
  renderInApp(
    <QueryClientProvider client={client}>
      <HistoryYearScreen year={year} isGuest={false} {...handlers} />
    </QueryClientProvider>,
    { language },
  )
  return handlers
}

beforeEach(() => {
  server.use(http.get('*/v1/verlauf', () => HttpResponse.json(HISTORY_RESPONSE)))
})

describe('HistoryYearScreen', () => {
  it('shows a Bescheid year with its sentence, the Abgleich (own changes first, form view collapsed), the deadline and the lessons', async () => {
    const { onBack, onOpenYear, onPrepareAppeal } = renderYear(2024)
    expect(await found('verlauf-jahr-titel')).toBe('2024')
    expect(text('verlauf-jahr-satz')).toBe('Bescheid da: Das Finanzamt hat 2 Positionen geändert.')
    expect(text('verlauf-abgleich-2024-anzahl')).toBe('2 Änderungen')
    expect(screen.getAllByTestId(/^verlauf-abgleich-2024-zeile-/)[0]!.getAttribute('data-testid')).toBe('verlauf-abgleich-2024-zeile-homeofficeA')
    expect(screen.queryByTestId('verlauf-abgleich-2024-formularansicht')).toBeNull()
    expect(screen.getByTestId('verlauf-abgleich-2024-lehren')).toBeTruthy()
    // The cut stays inside the Abgleich, not in the page's head.
    expect(text('verlauf-jahr-satz')).not.toContain('€')
    fireEvent.click(screen.getByTestId('verlauf-abgleich-2024-einspruch'))
    expect(onPrepareAppeal).toHaveBeenCalledWith(2024)
    fireEvent.click(screen.getByTestId('verlauf-zum-cockpit-2024'))
    expect(onOpenYear).toHaveBeenCalledWith(2024)
    fireEvent.click(screen.getByTestId('verlauf-jahr-zurueck'))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('shows both Abgleiche of two single returns', async () => {
    renderYear(2022)
    await screen.findByTestId('verlauf-abgleich-2022-A')
    expect(screen.getByTestId('verlauf-abgleich-2022-B')).toBeTruthy()
    expect(text('verlauf-jahr-satz')).toBe('Bescheid wie erklärt: Das Finanzamt hat nichts geändert.')
  })

  it('marks the change of the filing type only here', async () => {
    renderYear(2023)
    expect(await found('verlauf-jahr-wechsel')).toBe('ab 2023 zusammen veranlagt')
    expect(screen.getByTestId('verlauf-abgleich-2023-frist-vorbei')).toBeTruthy()
  })

  it('says honestly why a year with only its Bescheid has no Abgleich, and offers no cockpit outside the selectable years', async () => {
    renderYear(2021)
    expect(await found('verlauf-jahr-satz')).toBe(
      'Nur der Bescheid: Die Erklärung 2021 wurde nicht in SteuerEule gemacht, deshalb gibt es keinen Abgleich. Der Bescheid zählt im Verlauf trotzdem.',
    )
    expect(screen.queryByTestId('verlauf-zum-cockpit-2021')).toBeNull()
  })

  it('shows a waiting year with exactly the positions cut last year, no amount, no forecast', async () => {
    renderYear(2025)
    await screen.findByTestId('verlauf-wartet-2025')
    expect(text('verlauf-jahr-satz')).toBe('Abgegeben, der Bescheid steht aus.')
    const panel = text('verlauf-wartet-2025')
    expect(panel).toContain('Worauf du achten kannst')
    expect(panel).toContain('Homeoffice-Pauschale')
    expect(panel).toContain('Eine Vorhersage macht die Eule nicht.')
    expect(panel).not.toMatch(/€/)
  })

  it('says concretely what an open year lacks, with the month the certificates come in, and leads into its cockpit', async () => {
    const { onOpenYear } = renderYear(2026)
    await screen.findByTestId('verlauf-fehlt-2026')
    expect(text('verlauf-jahr-satz')).toBe('In Arbeit, noch nicht abgegeben.')
    expect(text('verlauf-fehlt-2026')).toContain('die Lohnsteuerbescheinigungen 2026 (kommen ab Februar 2027)')
    fireEvent.click(screen.getByTestId('verlauf-zum-cockpit-2026'))
    expect(onOpenYear).toHaveBeenCalledWith(2026)
  })

  it('says so for a year that is not in the Verlauf', async () => {
    renderYear(1999)
    expect(await found('verlauf-jahr-unbekannt')).toContain('1999 steht nicht im Verlauf')
  })

  it('speaks English', async () => {
    renderYear(2021, 'en')
    expect(await found('verlauf-jahr-satz')).toContain('Assessment only')
  })
})
