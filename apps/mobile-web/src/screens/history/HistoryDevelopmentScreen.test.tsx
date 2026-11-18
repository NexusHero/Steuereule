// ADR-0098 §2, §6 — „Entwicklung über die Jahre“ on its own page, one tap from the timeline, against the
// `GET /v1/verlauf` wire with the mock's example household: the refund first, the person toggle only
// where it applies, the detail of the picked year with its tier and the change to the year before, the
// data table behind the chart, the KPI tiles on wide screens, and the way back.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderInApp } from '../../test-render'
import { server } from '../../test-msw-server'
import { EMPTY_HISTORY_RESPONSE, HISTORY_RESPONSE } from '../../test-history-fixture'
import { HistoryDevelopmentScreen } from './HistoryDevelopmentScreen'

const text = (id: string) => (screen.getByTestId(id).textContent ?? '').replace(/ /g, ' ')

function setViewportWidth(width: number) {
  Object.defineProperty(document.documentElement, 'clientWidth', { value: width, configurable: true })
  window.dispatchEvent(new Event('resize'))
}

function renderDevelopment(language: 'de' | 'en' = 'de') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const handlers = { onBack: vi.fn(), onOpenYearDetail: vi.fn(), onOpenDrafts: vi.fn() }
  renderInApp(
    <QueryClientProvider client={client}>
      <HistoryDevelopmentScreen isGuest={false} openYear={2025} {...handlers} />
    </QueryClientProvider>,
    { language },
  )
  return handlers
}

beforeEach(() => {
  setViewportWidth(0)
  server.use(http.get('*/v1/verlauf', () => HttpResponse.json(HISTORY_RESPONSE)))
})

describe('HistoryDevelopmentScreen — phone', () => {
  it('opens with the refund, switches the key figure, and keeps the refund for the household', async () => {
    const { onBack } = renderDevelopment()
    await screen.findByTestId('verlauf-karte')
    expect(text('verlauf-entwicklung-titel')).toBe('Entwicklung über die Jahre')
    expect(text('verlauf-karte-titel')).toBe('Erstattung und Nachzahlung')
    expect(screen.getByLabelText('Erstattung und Nachzahlung, Jahre 2021–2026. Die Zahlen stehen in der Tabelle unter dem Diagramm.')).toBeTruthy()
    expect(text('verlauf-eule')).toContain('2024 hat das Finanzamt 92 € gekürzt.')

    fireEvent.click(screen.getByTestId('verlauf-person-B'))
    expect(text('verlauf-hinweis-haushalt')).toBe('Erstattung und Steuerquote gibt es nur gemeinsam. Angezeigt: Wir beide.')
    expect(text('verlauf-karte-titel')).toBe('Erstattung und Nachzahlung')

    fireEvent.click(screen.getByTestId('verlauf-kennzahl-werbungskosten'))
    expect(text('verlauf-karte-titel')).toBe('Werbungskosten je Jahr · Person B')
    expect(screen.queryByTestId('verlauf-hinweis-haushalt')).toBeNull()
    fireEvent.click(screen.getByTestId('verlauf-kennzahl-netto'))
    expect(text('verlauf-karte-titel')).toBe('Vom Brutto zum Netto · Person B')
    fireEvent.click(screen.getByTestId('verlauf-kennzahl-steuerquote'))
    expect(text('verlauf-karte-titel')).toBe('Wie viel Steuer aufs Brutto')

    fireEvent.click(screen.getByTestId('verlauf-entwicklung-zurueck'))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('moves the detail to a year picked in the chart, shows its tier and the change to the year before, and opens the year’s page', async () => {
    const { onOpenYearDetail } = renderDevelopment()
    await screen.findByTestId('verlauf-detail')
    fireEvent.click(screen.getByTestId('verlauf-diagramm-jahr-2025'))
    expect(text('verlauf-detail')).toContain('2025Schätzung')
    expect(text('verlauf-detail-erstattung')).toBe('Erstattung geschätzt+1.066–1.196 €')
    expect(text('verlauf-detail')).toContain('+257 € bis +387 € zum Vorjahr')

    fireEvent.click(screen.getByTestId('verlauf-diagramm-jahr-2023'))
    expect(text('verlauf-detail')).toContain('kein Vergleich: Veranlagungsart gewechselt')
    expect(text('verlauf-detail')).toContain('Schätzung vor dem Bescheid')
    expect(text('verlauf-detail')).toContain('innerhalb der Spanne')
    fireEvent.click(screen.getByTestId('verlauf-detail-abgleich'))
    expect(onOpenYearDetail).toHaveBeenCalledWith(2023)
  })

  it('says for a year with only its Bescheid that gross pay is not on it and offers its Lohnsteuerbescheinigung', async () => {
    renderDevelopment()
    await screen.findByTestId('verlauf-karte')
    fireEvent.click(screen.getByTestId('verlauf-kennzahl-netto'))
    fireEvent.click(screen.getByTestId('verlauf-diagramm-jahr-2021'))
    expect(text('verlauf-detail')).toContain('Brutto und Abzüge stehen nicht im Bescheid 2021')
    expect(screen.getByTestId('verlauf-detail-lstb')).toBeTruthy()
    expect(text('verlauf-detail')).toContain('nur Bescheid')
    expect(text('verlauf-detail')).not.toContain('Eckjahr')
  })

  it('has a data table behind the chart with every year and tier', async () => {
    renderDevelopment()
    await screen.findByTestId('verlauf-karte')
    expect(screen.queryByTestId('verlauf-datentabelle')).toBeNull()
    fireEvent.click(screen.getByTestId('verlauf-datentabelle-umschalten'))
    const table = screen.getByTestId('verlauf-datentabelle')
    expect(table.getAttribute('role')).toBe('table')
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(7)
    expect((rows[4]!.textContent ?? '').replace(/ /g, ' ')).toBe('2024Bescheid+901 €+809 €−92 €')
    expect((rows[6]!.textContent ?? '').replace(/ /g, ' ')).toBe('2026offen–noch offen–')
  })

  it('says so when there is no year to show', async () => {
    server.use(http.get('*/v1/verlauf', () => HttpResponse.json(EMPTY_HISTORY_RESPONSE)))
    renderDevelopment()
    expect(await screen.findByTestId('verlauf-entwicklung-leer')).toBeTruthy()
  })
})

describe('HistoryDevelopmentScreen — tablet and desktop', () => {
  beforeEach(() => setViewportWidth(1280))

  it('shows the KPI tiles for the latest year with a value, and the person toggle in the header', async () => {
    renderDevelopment()
    await screen.findByTestId('verlauf-kpi-erstattung')
    expect(text('verlauf-kpi-erstattung')).toContain('Erstattung 2025 · Wir beide')
    expect(text('verlauf-kpi-erstattung')).toContain('+1.066–1.196 €')
    expect(text('verlauf-kpi-netto')).toContain('Brutto → Netto 2025 · Wir beide')
    expect(screen.queryByTestId('verlauf-kennzahl-erstattung')).toBeNull()
    fireEvent.click(screen.getByTestId('verlauf-kpi-werbungskosten'))
    expect(text('verlauf-karte-titel')).toBe('Werbungskosten je Jahr')
    fireEvent.click(screen.getByTestId('verlauf-person-A'))
    expect(text('verlauf-karte-titel')).toBe('Werbungskosten je Jahr · Person A')
  })
})

describe('HistoryDevelopmentScreen — English', () => {
  it('speaks English', async () => {
    renderDevelopment('en')
    await screen.findByTestId('verlauf-karte')
    expect(text('verlauf-karte-titel')).toBe('Refund and back payment')
  })
})
