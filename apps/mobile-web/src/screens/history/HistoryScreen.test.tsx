// ADR-0098 — the tab „Verlauf“ against the generated `useYearHistoryControllerGet` hook and the
// `GET /v1/verlauf` wire, MSW-mocked to the contract with the mock's example household. Proves the
// order of the mock (what is due → summary → the years → the Abgleich of the picked year → the
// development), the honest states (guest, loading, error, empty, Eckjahr without Abgleich, a year
// waiting for its Bescheid), the person toggle only where it applies, the data table behind the chart,
// and the upload entry into the one Beleg pipeline with the Bescheid's reading.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ParseReceiptResponseDto } from '@steuereule/api-client'
import { renderInApp } from '../../test-render'
import { server } from '../../test-msw-server'
import { EMPTY_HISTORY_RESPONSE, HISTORY_RESPONSE } from '../../test-history-fixture'
import { HistoryScreen, type HistoryScreenProps } from './HistoryScreen'

const { mockExtractDocumentText } = vi.hoisted(() => ({ mockExtractDocumentText: vi.fn() }))
vi.mock('../../lib/documentOcr', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/documentOcr')>()
  return { ...actual, extractDocumentTextOnDevice: mockExtractDocumentText }
})

const URL = '*/v1/verlauf'

function setViewportWidth(width: number) {
  Object.defineProperty(document.documentElement, 'clientWidth', { value: width, configurable: true })
  window.dispatchEvent(new Event('resize'))
}

function renderHistory(props: Partial<HistoryScreenProps> = {}, language: 'de' | 'en' = 'de') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const handlers = { onRegister: vi.fn(), onLogin: vi.fn(), onOpenYear: vi.fn(), onPrepareAppeal: vi.fn(), onOpenDrafts: vi.fn() }
  renderInApp(
    <QueryClientProvider client={client}>
      <HistoryScreen isGuest={false} openYear={2025} {...handlers} {...props} />
    </QueryClientProvider>,
    { language },
  )
  return handlers
}

const text = (id: string) => (screen.getByTestId(id).textContent ?? '').replace(/ /g, ' ')

beforeEach(() => {
  setViewportWidth(0)
  server.use(http.get(URL, () => HttpResponse.json(HISTORY_RESPONSE)))
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('HistoryScreen — states', () => {
  it('asks a guest for an account instead of loading anything', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const { onRegister, onLogin } = renderHistory({ isGuest: true })
    expect(screen.getByTestId('verlauf-gast')).toBeTruthy()
    fireEvent.click(screen.getByTestId('verlauf-gast-registrieren'))
    fireEvent.click(screen.getByTestId('verlauf-gast-anmelden'))
    expect(onRegister).toHaveBeenCalledOnce()
    expect(onLogin).toHaveBeenCalledOnce()
    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes('/v1/verlauf'))).toBe(false)
  })

  it('shows a real loading state, then the tab', async () => {
    renderHistory()
    expect(screen.getByLabelText('Dein Verlauf wird geladen …')).toBeTruthy()
    expect(await screen.findByTestId('verlauf-titel')).toBeTruthy()
    expect(screen.getByText('Alle Steuerjahre · 2021–2026')).toBeTruthy()
  })

  it('says so when the history cannot be loaded, with a retry', async () => {
    server.use(http.get(URL, () => HttpResponse.json({ message: 'boom' }, { status: 500 })))
    renderHistory()
    expect(await screen.findByTestId('verlauf-fehler')).toBeTruthy()
    server.use(http.get(URL, () => HttpResponse.json(HISTORY_RESPONSE)))
    fireEvent.click(screen.getByTestId('fehler-erneut-versuchen'))
    expect(await screen.findByTestId('verlauf-titel')).toBeTruthy()
  })

  it('treats a 401 as a guest', async () => {
    server.use(http.get(URL, () => new HttpResponse(null, { status: 401 })))
    renderHistory()
    expect(await screen.findByTestId('verlauf-gast')).toBeTruthy()
  })

  it('says honestly that there is no year yet and still offers the upload', async () => {
    server.use(http.get(URL, () => HttpResponse.json(EMPTY_HISTORY_RESPONSE)))
    renderHistory()
    expect(await screen.findByTestId('verlauf-leer')).toBeTruthy()
    expect(screen.getByTestId('verlauf-upload')).toBeTruthy()
  })
})

describe('HistoryScreen — phone', () => {
  it('puts what is due first: the highlighted appeal deadline with euros and days, the waiting year with its repeated cuts, the open year with what is missing', async () => {
    renderHistory()
    await screen.findByTestId('verlauf-ansteht')
    const items = within(screen.getByTestId('verlauf-ansteht')).getAllByRole('button')
    expect(items.map((b) => b.getAttribute('data-testid'))).toEqual(['verlauf-ansteht-2024', 'verlauf-ansteht-2026', 'verlauf-ansteht-2025'])
    expect(text('verlauf-ansteht-2024')).toContain('Bescheid weicht ab: −92 €')
    expect(text('verlauf-ansteht-2024')).toContain('Einspruch bis 07.12.2026 · noch 19 Tage')
    expect(text('verlauf-ansteht-2025')).toContain('2 Positionen wie 2024 erklärt, dort gekürzt: Homeoffice-Pauschale, Arbeitsmittel')
    expect(text('verlauf-ansteht-2026')).toContain('Fehlt noch: die Lohnsteuerbescheinigung und die Lohnsteuerbescheinigung von Person B.')
  })

  it('sums up the Bescheid years and what the Finanzamt changed (mock `held()`)', async () => {
    renderHistory()
    await screen.findByTestId('verlauf-held')
    expect(text('verlauf-held')).toContain('Erstattet 2021–2024')
    expect(text('verlauf-held-erstattet')).toBe('+1.632 €')
    expect(text('verlauf-held')).toContain('aus 4 Bescheidjahren')
    expect(text('verlauf-held-geaendert')).toBe('−92 €')
    expect(text('verlauf-held')).toContain('in 1 von 3 Erklärungen')
  })

  it('lists the years newest first, the cut year with the declared refund struck, and opens the highlighted year’s Abgleich below', async () => {
    renderHistory()
    await screen.findByTestId('verlauf-jahre')
    const rows = within(screen.getByTestId('verlauf-jahre')).getAllByRole('button')
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual(['verlauf-jahr-2026', 'verlauf-jahr-2025', 'verlauf-jahr-2024', 'verlauf-jahr-2023', 'verlauf-jahr-2022', 'verlauf-jahr-2021'])
    expect(text('verlauf-jahr-2024')).toContain('Bescheid eingegangen, 2 Abweichungen · Zusammen')
    expect(text('verlauf-jahr-2024')).toContain('+901 €+809 €−92 €')
    expect(text('verlauf-jahr-2025')).toContain('Eingereicht · wartet auf Bescheid')
    expect(text('verlauf-jahr-2025')).toContain('Schätzung')
    expect(text('verlauf-jahr-2021')).toContain('Eckjahr')
    expect(screen.getByTestId('verlauf-abgleich-2024')).toBeTruthy()
  })

  it('opens a tapped year’s Abgleich directly below, with the way into its cockpit and into the Einspruch', async () => {
    const { onOpenYear, onPrepareAppeal } = renderHistory()
    await screen.findByTestId('verlauf-abgleich-2024')
    fireEvent.click(screen.getByTestId('verlauf-abgleich-2024-einspruch'))
    expect(onPrepareAppeal).toHaveBeenCalledWith(2024)
    fireEvent.click(screen.getByTestId('verlauf-zum-cockpit-2024'))
    expect(onOpenYear).toHaveBeenCalledWith(2024)

    fireEvent.click(screen.getByTestId('verlauf-jahr-2022'))
    expect(screen.getByTestId('verlauf-abgleich-2022-A')).toBeTruthy()
    expect(screen.getByTestId('verlauf-abgleich-2022-B')).toBeTruthy()
    expect(screen.queryByTestId('verlauf-abgleich-2024')).toBeNull()
  })

  it('says why an Eckjahr has no Abgleich, and offers no cockpit for a year outside the selectable ones', async () => {
    renderHistory()
    await screen.findByTestId('verlauf-jahre')
    fireEvent.click(screen.getByTestId('verlauf-jahr-2021'))
    expect(text('verlauf-ohne-abgleich-2021-grund')).toBe('Kein Abgleich: Die Erklärung 2021 wurde nicht in SteuerEule gemacht. Der Bescheid zählt im Verlauf trotzdem.')
    expect(screen.queryByTestId('verlauf-zum-cockpit-2021')).toBeNull()
  })

  it('shows a year waiting for its Bescheid with exactly the positions cut last year, no amount, no forecast', async () => {
    renderHistory()
    await screen.findByTestId('verlauf-jahre')
    fireEvent.click(screen.getByTestId('verlauf-jahr-2025'))
    const panel = text('verlauf-ohne-abgleich-2025')
    expect(panel).toContain('2025: worauf du achten kannst')
    expect(panel).toContain('Homeoffice-Pauschale')
    expect(panel).toContain('Eine Vorhersage macht die Eule nicht.')
    expect(panel).not.toMatch(/€/)
    fireEvent.click(screen.getByTestId('verlauf-ohne-abgleich-2025-schliessen'))
    expect(screen.queryByTestId('verlauf-ohne-abgleich-2025')).toBeNull()
  })

  it('opens the development with the refund, switches the key figure, and keeps the refund for the household', async () => {
    renderHistory()
    await screen.findByTestId('verlauf-karte')
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
  })

  it('moves the detail to a year picked in the chart and shows its tier and the change to the year before', async () => {
    renderHistory()
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
    expect(screen.getByTestId('verlauf-abgleich-2023')).toBeTruthy()
  })

  it('says for an Eckjahr that gross pay is not on the Bescheid and offers its Lohnsteuerbescheinigung', async () => {
    renderHistory()
    await screen.findByTestId('verlauf-karte')
    fireEvent.click(screen.getByTestId('verlauf-kennzahl-netto'))
    fireEvent.click(screen.getByTestId('verlauf-diagramm-jahr-2021'))
    expect(text('verlauf-detail')).toContain('Brutto und Abzüge stehen nicht im Bescheid 2021')
    expect(screen.getByTestId('verlauf-detail-lstb')).toBeTruthy()
    expect(text('verlauf-detail')).toContain('Eckjahr · Bescheid')
  })

  it('has a data table behind the chart with every year and tier', async () => {
    renderHistory()
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
})

describe('HistoryScreen — tablet and desktop', () => {
  beforeEach(() => setViewportWidth(1280))

  it('shows the years as a table with the stage pills and the KPI tiles for the latest year with a value', async () => {
    renderHistory()
    await screen.findByTestId('verlauf-tabelle')
    expect(screen.queryByTestId('verlauf-jahre')).toBeNull()
    expect(screen.getByText('Alle Jahre: erklärt und festgesetzt')).toBeTruthy()
    expect(text('verlauf-tabelle-2024')).toContain('Bescheid · 2 Abw.')
    expect(text('verlauf-tabelle-2024')).toContain('−92 €')
    expect(text('verlauf-tabelle-2022')).toContain('Bescheid · wie erklärt')
    expect(text('verlauf-kpi-erstattung')).toContain('Erstattung 2025 · Wir beide')
    expect(text('verlauf-kpi-erstattung')).toContain('+1.066–1.196 €')
    expect(text('verlauf-kpi-netto')).toContain('Brutto → Netto 2025 · Wir beide')
    expect(screen.queryByTestId('verlauf-kennzahl-erstattung')).toBeNull()
    fireEvent.click(screen.getByTestId('verlauf-kpi-werbungskosten'))
    expect(text('verlauf-karte-titel')).toBe('Werbungskosten je Jahr')
  })

  it('switches the table’s person columns with the toggle in the header', async () => {
    renderHistory()
    await screen.findByTestId('verlauf-tabelle')
    expect(screen.getByText('Brutto · Wir beide')).toBeTruthy()
    fireEvent.click(screen.getByTestId('verlauf-person-A'))
    expect(screen.getByText('Brutto · Person A')).toBeTruthy()
    expect(text('verlauf-tabelle-2024')).toContain('54.900 €')
    fireEvent.click(screen.getByTestId('verlauf-tabelle-2023'))
    expect(screen.getByTestId('verlauf-abgleich-2023')).toBeTruthy()
  })
})

describe('HistoryScreen — upload entry', () => {
  function parseAnswer(): ParseReceiptResponseDto {
    return {
      mode: 'deterministic_fallback',
      securityBlocked: false,
      parsed: { vendorCategory: 'sonstiges', receiptDate: null, amountEur: null, suggestedScreen: null, suggestedField: null, suggestedValue: null, summary: '', taxYear: 2020 },
      stagedAction: null,
      assistantMessage: null,
      draftsTaxYear: 2020,
      filedInTaxYear: 2020,
      noValuesReason: null,
      duplicateOf: null,
      processing: { state: 'vorschlaege', reason: null, pending: 4, applied: 0, dismissed: 0, draftsTaxYear: 2020, open: true },
      assessmentNotice: {
        receiptId: 'bescheid-1',
        taxYearOnDocument: 2020,
        assessmentDate: '2021-06-14',
        read: ['festgesetzteSteuer', 'erstattung'],
        notRead: ['bruttoarbeitslohnA'],
        explanations: 1,
        createsEckjahr: true,
        stagedActionIds: ['a1', 'a2', 'a3', 'a4'],
      },
    }
  }

  it('sends the Bescheid through the one Beleg pipeline as `steuerbescheid` and shows what was read, what not, and the Eckjahr', async () => {
    const bodies: { parse: unknown[] } = { parse: [] }
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    mockExtractDocumentText.mockResolvedValue({ kind: 'pdf', mimeType: 'application/pdf', text: 'Bescheid für 2020 über Einkommensteuer', usedOcrFallback: false, pagesProcessed: 1 })
    server.use(
      http.post('*/v1/belege/upload', () => HttpResponse.json({ id: 'bescheid-1' }, { status: 201 })),
      http.post('*/v1/belege/parse', async ({ request }) => {
        bodies.parse.push(await request.json())
        return HttpResponse.json(parseAnswer())
      }),
    )
    const { onOpenDrafts } = renderHistory()
    await screen.findByTestId('verlauf-upload')
    expect(text('verlauf-upload')).toContain('2020 oder früher ergänzen')
    fireEvent.change(screen.getByTestId('verlauf-upload-datei'), { target: { files: [new File(['%PDF-1.4'], 'bescheid-2020.pdf', { type: 'application/pdf' })] } })
    expect(await screen.findByTestId('verlauf-upload-bescheid')).toBeTruthy()
    const uploadBody = fetchSpy.mock.calls.find(([url]) => String(url).endsWith('/v1/belege/upload'))?.[1]?.body
    expect(uploadBody instanceof FormData && uploadBody.get('kind')).toBe('Steuerbescheid')
    expect(bodies.parse[0]).toMatchObject({ kind: 'steuerbescheid', expectedKind: 'steuerbescheid', receiptId: 'bescheid-1', stageDraft: true })
    const notice = text('verlauf-upload-bescheid')
    expect(notice).toContain('Bescheid für 2020 erkannt. Bescheiddatum 14.06.2021.')
    expect(notice).toContain('Gelesen (2): Einkommensteuer und Erstattung.')
    expect(text('verlauf-upload-nicht-gelesen')).toBe('Nicht gelesen, bleibt offen und zählt nie als 0: Bruttoarbeitslohn · Person A.')
    expect(text('verlauf-upload-eckjahr')).toContain('entsteht ein Eckjahr')
    expect(notice).toContain('4 Entwürfe warten bei der Eule')
    fireEvent.click(screen.getByTestId('verlauf-upload-vorschlaege'))
    expect(onOpenDrafts).toHaveBeenCalledOnce()
  })

  it('refuses a file that is no PDF or photo without uploading it', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    renderHistory()
    await screen.findByTestId('verlauf-upload')
    fireEvent.change(screen.getByTestId('verlauf-upload-datei'), { target: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] } })
    await waitFor(() => expect(screen.getByTestId('verlauf-upload-fehler')).toBeTruthy())
    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes('/v1/belege/upload'))).toBe(false)
  })
})

describe('HistoryScreen — English', () => {
  it('speaks English', async () => {
    renderHistory({}, 'en')
    expect(await screen.findByText('Your tax years')).toBeTruthy()
    expect(text('verlauf-karte-titel')).toBe('Refund and back payment')
  })
})
