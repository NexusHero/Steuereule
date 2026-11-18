// ADR-0098 — the tab „Verlauf“ as a timeline (alternative A) against the generated
// `useYearHistoryControllerGet` hook and the `GET /v1/verlauf` wire, MSW-mocked to the contract with the
// mock's example household. Proves the one-screen tab (what matters now in the cockpit's dark block, one
// row per year, the way to the development and to older years), the honest states (guest, loading,
// error, empty, nothing due), the four-column table on wide screens, and the upload entry into the one
// Beleg pipeline with the Bescheid's reading.
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
  const handlers = { onRegister: vi.fn(), onLogin: vi.fn(), onOpenYearDetail: vi.fn(), onOpenDevelopment: vi.fn(), onOpenDrafts: vi.fn() }
  renderInApp(
    <QueryClientProvider client={client}>
      <HistoryScreen isGuest={false} openYear={2025} {...handlers} {...props} />
    </QueryClientProvider>,
    { language },
  )
  return handlers
}

const text = (id: string) => (screen.getByTestId(id).textContent ?? '').replace(/ /g, ' ')
const label = (id: string) => (screen.getByTestId(id).getAttribute('aria-label') ?? '').replace(/\u00a0/g, ' ')

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
    // With no year yet, the upload is the only thing to do, so it is open.
    expect(screen.getByTestId('verlauf-upload')).toBeTruthy()
  })
})

describe('HistoryScreen — phone', () => {
  it('opens with „Jetzt wichtig“ in the cockpit’s dark block: only the highlighted deadline, its cut and its days, one button', async () => {
    const { onOpenYearDetail } = renderHistory()
    await screen.findByTestId('verlauf-jetzt')
    expect(text('verlauf-jetzt')).toContain('Jetzt wichtig')
    expect(text('verlauf-jetzt')).toContain('2024: Das Finanzamt hat gekürzt')
    expect(text('verlauf-jetzt')).toContain('−92 €')
    expect(text('verlauf-jetzt')).toContain('Einspruch noch 19 Tage möglich')
    expect(label('verlauf-jetzt-inhalt')).toBe('2024: Das Finanzamt hat 92 € gekürzt. Einspruch noch 19 Tage möglich')
    expect(text('verlauf-jetzt-weitere')).toBe('+ 2 weitere Jahre brauchen dich')
    // The other open years are no cards of their own.
    expect(text('verlauf-jetzt')).not.toContain('2025')
    fireEvent.click(screen.getByTestId('verlauf-jetzt-ansehen'))
    expect(onOpenYearDetail).toHaveBeenCalledWith(2024)
  })

  it('puts the waiting year in front when no deadline runs, and the open year after that', async () => {
    server.use(http.get(URL, () => HttpResponse.json({ ...HISTORY_RESPONSE, openItems: HISTORY_RESPONSE.openItems.filter((o) => o.kind !== 'einspruchsfrist') })))
    renderHistory()
    await screen.findByTestId('verlauf-jetzt')
    expect(text('verlauf-jetzt')).toContain('2025: Der Bescheid steht aus')
    expect(text('verlauf-jetzt')).toContain('Achte auf 2 Positionen, die 2024 gekürzt wurden.')
    expect(text('verlauf-jetzt-weitere')).toBe('+ 1 weiteres Jahr braucht dich')
  })

  it('says what an open year lacks in a few words when it is the only item', async () => {
    server.use(http.get(URL, () => HttpResponse.json({ ...HISTORY_RESPONSE, openItems: HISTORY_RESPONSE.openItems.filter((o) => o.kind === 'offen') })))
    renderHistory()
    await screen.findByTestId('verlauf-jetzt')
    expect(text('verlauf-jetzt')).toContain('2026: noch in Arbeit')
    expect(text('verlauf-jetzt')).toContain('2 Lohnsteuerbescheinigungen fehlen')
    expect(screen.queryByTestId('verlauf-jetzt-weitere')).toBeNull()
  })

  it('says „Alles erledigt“ calmly when nothing is due, without a button', async () => {
    server.use(http.get(URL, () => HttpResponse.json({ ...HISTORY_RESPONSE, openItems: [] })))
    renderHistory()
    await screen.findByTestId('verlauf-jetzt-erledigt')
    expect(text('verlauf-jetzt-erledigt')).toBe('Alles erledigt')
    expect(text('verlauf-jetzt')).toContain('Kein Jahr wartet gerade auf dich.')
    expect(screen.queryByTestId('verlauf-jetzt-ansehen')).toBeNull()
  })

  it('lists one row per year, newest first: the year, one plain phrase, one amount; a range stays a range', async () => {
    const { onOpenYearDetail } = renderHistory()
    await screen.findByTestId('verlauf-jahre')
    const rows = within(screen.getByTestId('verlauf-jahre')).getAllByRole('button')
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual(['verlauf-jahr-2026', 'verlauf-jahr-2025', 'verlauf-jahr-2024', 'verlauf-jahr-2023', 'verlauf-jahr-2022', 'verlauf-jahr-2021', 'verlauf-entwicklung'])
    expect(text('verlauf-jahr-2026')).toBe('2026–in Arbeit · 2 Lohnsteuerbescheinigungen fehlen')
    expect(text('verlauf-jahr-2025')).toBe('2025+1.066–1.196 €abgegeben · wartet auf Bescheid')
    expect(text('verlauf-jahr-2024')).toBe('2024+809 €Bescheid · 92 € weniger als erklärt')
    expect(text('verlauf-jahr-2023')).toBe('2023+210 €Bescheid wie erklärt')
    expect(text('verlauf-jahr-2022')).toBe('2022+393 €Bescheid wie erklärt')
    expect(text('verlauf-jahr-2021')).toBe('2021+220 €nur Bescheid')
    // No stage pills, no filing type in the row.
    expect(text('verlauf-jahre')).not.toMatch(/Zusammen|Einzeln|Schätzung|Eckjahr|Abw\./)
    expect(label('verlauf-jahr-2024')).toBe('2024: Bescheid · 92 € weniger als erklärt, +809 €')
    fireEvent.click(screen.getByTestId('verlauf-jahr-2022'))
    expect(onOpenYearDetail).toHaveBeenCalledWith(2022)
  })

  it('leads to the development and keeps the upload behind a quiet link', async () => {
    const { onOpenDevelopment } = renderHistory()
    await screen.findByTestId('verlauf-entwicklung')
    fireEvent.click(screen.getByTestId('verlauf-entwicklung'))
    expect(onOpenDevelopment).toHaveBeenCalledOnce()
    expect(screen.queryByTestId('verlauf-upload')).toBeNull()
    fireEvent.click(screen.getByTestId('verlauf-aeltere'))
    expect(text('verlauf-upload')).toContain('2020 oder früher ergänzen')
    fireEvent.click(screen.getByTestId('verlauf-aeltere'))
    expect(screen.queryByTestId('verlauf-upload')).toBeNull()
  })

  it('fits one phone screen: no summary, no Abgleich, no chart on the tab, and the cut named once besides the hero', async () => {
    renderHistory()
    await screen.findByTestId('verlauf-jahre')
    for (const id of ['verlauf-held', 'verlauf-abgleich-2024', 'verlauf-karte', 'verlauf-diagramm', 'verlauf-ansteht', 'verlauf-upload']) expect(screen.queryByTestId(id)).toBeNull()
    const all = text('screen-container')
    // The review counted 590 words, 45 amounts and the cut 13 times; the timeline keeps it to a screen.
    const words = all.replace(/[·→+–−]/g, ' ').split(/\s+/).filter((w) => /[\p{L}\d]/u.test(w))
    expect(words.length).toBeLessThanOrEqual(75)
    expect(all.match(/€/g)?.length ?? 0).toBeLessThanOrEqual(8)
    expect(all.match(/92 €/g)?.length).toBe(2)
    // Header, hero, six rows, the development row and the quiet link: nothing else.
    expect(screen.getAllByRole('button')).toHaveLength(10)
  })
})

describe('HistoryScreen — tablet and desktop', () => {
  beforeEach(() => setViewportWidth(1280))

  it('keeps hero, timeline and links, the timeline as a table of four columns without horizontal scroll', async () => {
    const { onOpenYearDetail } = renderHistory()
    await screen.findByTestId('verlauf-tabelle')
    expect(screen.queryByTestId('verlauf-jahre')).toBeNull()
    expect(screen.getByTestId('verlauf-jetzt')).toBeTruthy()
    expect(within(screen.getByTestId('verlauf-tabelle')).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Jahr', 'Stand', 'erklärt', 'laut Bescheid'])
    expect(text('verlauf-tabelle-2024')).toBe('2024Bescheid · 92 € weniger als erklärt+901 €+809 €')
    expect(text('verlauf-tabelle-2025')).toBe('2025abgegeben · wartet auf Bescheid+1.066–1.196 €–')
    expect(text('verlauf-tabelle-2021')).toBe('2021nur Bescheid–+220 €')
    expect(screen.queryByTestId('verlauf-kpi-erstattung')).toBeNull()
    expect(screen.getByTestId('verlauf-entwicklung')).toBeTruthy()
    expect(screen.getByTestId('verlauf-aeltere')).toBeTruthy()
    fireEvent.click(screen.getByTestId('verlauf-tabelle-2023'))
    expect(onOpenYearDetail).toHaveBeenCalledWith(2023)
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
    fireEvent.click(await screen.findByTestId('verlauf-aeltere'))
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
    expect(text('verlauf-upload-eckjahr')).toContain('steht 2020 im Verlauf als „nur Bescheid“')
    expect(notice).toContain('4 Entwürfe warten bei der Eule')
    fireEvent.click(screen.getByTestId('verlauf-upload-vorschlaege'))
    expect(onOpenDrafts).toHaveBeenCalledOnce()
  })

  it('refuses a file that is no PDF or photo without uploading it', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    renderHistory()
    fireEvent.click(await screen.findByTestId('verlauf-aeltere'))
    fireEvent.change(screen.getByTestId('verlauf-upload-datei'), { target: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] } })
    await waitFor(() => expect(screen.getByTestId('verlauf-upload-fehler')).toBeTruthy())
    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes('/v1/belege/upload'))).toBe(false)
  })
})

describe('HistoryScreen — English', () => {
  it('speaks English', async () => {
    renderHistory({}, 'en')
    expect(await screen.findByText('Important now')).toBeTruthy()
    expect(text('verlauf-jahr-2024')).toBe('2024+809 €Assessment · 92 € less than declared')
    expect(text('verlauf-jahr-2021')).toBe('2021+220 €assessment only')
    expect(text('verlauf-entwicklung')).toContain('See the development')
  })
})
