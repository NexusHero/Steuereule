// REQ-001 (steuereule#3, T6/#93) + ticket 15 (Cockpit-Echtdaten) — Cockpit hero card: the
// deterministic stand (point / range / gated) from the core, "N Fragen offen", honest
// loading/empty/error states, i18n de/en, exactly one primary action. Exercises the real
// generated `useCockpitControllerGetCockpitSummary` hook (@steuereule/api-client) against
// `GET /v1/steuerjahre/{jahr}/cockpit`, with MSW mocking the wire shape.
import { afterEach, describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { createAppI18n } from '../../i18n/app-i18n'
import { CockpitScreen } from './CockpitScreen'
import { server } from '../../test-msw-server'
import type { CockpitSummaryDto, InterviewStateDto } from '@steuereule/api-client'
import type { FunnelPath } from '../funnel/KontoWandScreen'

const TAX_YEAR = 2026
const COCKPIT_URL = `*/v1/steuerjahre/${TAX_YEAR}/cockpit`

const LOADED_SUMMARY: CockpitSummaryDto = {
  taxYear: TAX_YEAR,
  status: { kind: 'spanne', from: 49880, to: 50120, openItems: 2, conflicts: 0 },
  openItems: 6,
}

function mockCockpit(data: CockpitSummaryDto | null, status = 200) {
  // The wire body IS the CockpitSummaryDto (or null) directly — matching the profile client's
  // convention, where the `{ data, status }` envelope is httpClient's own generic wrapper around
  // the parsed JSON, never something the server itself sends.
  server.use(http.get(COCKPIT_URL, () => HttpResponse.json(data, { status })))
}

const INTERVIEW_URL = `*/v1/steuerjahre/${TAX_YEAR}/interview`

function mockInterview(answers: Record<string, string>, done = true) {
  const state: InterviewStateDto = {
    answers,
    nextStep: done ? { kind: 'done' } : { kind: 'question', id: 'kinder' },
    openItems: done ? 0 : 1,
  }
  server.use(http.get(INTERVIEW_URL, () => HttpResponse.json(state, { status: 200 })))
}

function holdNextCockpitResponse(body: CockpitSummaryDto | null): () => void {
  let release: () => void = () => {}
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  server.use(
    http.get(COCKPIT_URL, async () => {
      await pending
      return HttpResponse.json(body, { status: 200 })
    }),
  )
  return () => release()
}

afterEach(() => focusManager.setFocused(undefined))

function regainFocus() {
  act(() => {
    focusManager.setFocused(false)
    focusManager.setFocused(true)
  })
}

function mockCockpitError() {
  server.use(http.get(COCKPIT_URL, () => HttpResponse.error()))
}

function renderCockpit(opts: {
  lng?: 'de' | 'en'
  onOpenInterview?: () => void
  onOpenKinder?: () => void
  onOpenOwlMode?: (year: number) => void
  onOpenPrintout?: (year: number) => void
  onOpenConfirmation?: (year: number) => void
  onContinuePath?: (path: FunnelPath) => void
  onYearChange?: (year: number) => void
  onOpenMasterData?: () => void
  taxYear?: number
} = {}) {
  const i18n = createAppI18n(opts.lng ?? 'de')
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider mode="light">
          <CockpitScreen
            taxYear={opts.taxYear ?? TAX_YEAR}
            onOpenInterview={opts.onOpenInterview ?? (() => {})}
            {...(opts.onOpenKinder ? { onOpenKinder: opts.onOpenKinder } : {})}
            {...(opts.onOpenOwlMode ? { onOpenOwlMode: opts.onOpenOwlMode } : {})}
            {...(opts.onOpenPrintout ? { onOpenPrintout: opts.onOpenPrintout } : {})}
            {...(opts.onOpenConfirmation ? { onOpenConfirmation: opts.onOpenConfirmation } : {})}
            {...(opts.onContinuePath ? { onContinuePath: opts.onContinuePath } : {})}
            {...(opts.onYearChange ? { onYearChange: opts.onYearChange } : {})}
            {...(opts.onOpenMasterData ? { onOpenMasterData: opts.onOpenMasterData } : {})}
          />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

describe('CockpitScreen', () => {
  it('shows a real loading state while the summary is fetched', async () => {
    mockCockpit(LOADED_SUMMARY)
    renderCockpit()
    expect(screen.getByLabelText('Dein Cockpit wird geladen …')).toBeTruthy()

    await screen.findByText('Erfasstes Einkommen')
    expect(screen.queryByLabelText('Dein Cockpit wird geladen …')).toBeNull()
  })

  it('renders the spanne from the API (never hard-coded)', async () => {
    mockCockpit(LOADED_SUMMARY)
    renderCockpit()

    expect(await screen.findByText('49.880–50.120 €')).toBeTruthy()
  })

  it('says the income is still open instead of inventing a range like 0–120 €', async () => {
    mockCockpit({
      taxYear: TAX_YEAR,
      status: { kind: 'spanne', from: 0, to: 120, openItems: 2, conflicts: 0, unconfirmedItems: 0, unconfirmedSum: 0 },
      openItems: 0,
    })
    renderCockpit()

    expect(await screen.findByText('Noch offen')).toBeTruthy()
    expect(screen.getByText('2 Posten offen')).toBeTruthy()
    expect(screen.queryByText('0–120 €')).toBeNull()
  })

  it('renders a settled point value with no range dashes (ADR-015)', async () => {
    mockCockpit({ taxYear: TAX_YEAR, status: { kind: 'bestimmt', value: 50000 }, openItems: 0 })
    renderCockpit()

    expect(await screen.findByText('50.000 €')).toBeTruthy()
    expect(screen.queryByText(/–/)).toBeNull()
  })

  it('renders the gated stand honestly, naming the gated Einkunftsart, never a fake number (ADR-032)', async () => {
    mockCockpit({ taxYear: TAX_YEAR, status: { kind: 'gated', sum: 50000, gated: ['Gewerbe'] }, openItems: 0 })
    renderCockpit()

    expect(await screen.findByText('Ehrlich: dafür sind wir noch nicht gut genug.')).toBeTruthy()
    expect(screen.getByText('Gewerbe kann SteuerEule in Version 1 noch nicht rechnen. Dein erfasstes Einkommen bleibt sichtbar — abgegeben wird erst, wenn alles drin ist.')).toBeTruthy()
  })

  it('shows the plural "N Fragen offen" copy read from the API', async () => {
    mockCockpit(LOADED_SUMMARY)
    renderCockpit()

    expect(await screen.findByText('6 Fragen offen')).toBeTruthy()
  })

  it('shows the singular "1 Frage offen" copy when exactly one item is open', async () => {
    mockCockpit({ ...LOADED_SUMMARY, openItems: 1 })
    renderCockpit()

    expect(await screen.findByText('1 Frage offen')).toBeTruthy()
  })

  it('shows the "N Posten offen" line from the spanne', async () => {
    mockCockpit(LOADED_SUMMARY)
    renderCockpit()

    expect(await screen.findByText('2 Posten offen')).toBeTruthy()
  })

  it('reveals provenance (Herkunft) on tap, consistent with the shown range', async () => {
    mockCockpit(LOADED_SUMMARY)
    renderCockpit()

    await screen.findByText('Erfasstes Einkommen')
    fireEvent.click(screen.getByText('Herkunft'))
    expect(screen.getByText('Spannen-Regel · ADR-015')).toBeTruthy()
    expect(screen.getByText('2 offene Posten × 60 € Unsicherheit')).toBeTruthy()
  })

  it('shows the appbar title and tax year pill', async () => {
    mockCockpit(LOADED_SUMMARY)
    renderCockpit()

    await screen.findByText('Erfasstes Einkommen')
    expect(screen.getByText('Steuerjahr')).toBeTruthy()
    expect(screen.getByText('2026')).toBeTruthy()
  })

  it('shows "Fragen beantworten" as the primary CTA while items are open, and reaches the Minimal-Gate', async () => {
    mockCockpit(LOADED_SUMMARY)
    const onOpenInterview = vi.fn()
    renderCockpit({ onOpenInterview })

    await screen.findByText('Erfasstes Einkommen')
    expect(screen.getByText('Fragen beantworten')).toBeTruthy()

    fireEvent.click(screen.getByText('Fragen beantworten'))
    expect(onOpenInterview).toHaveBeenCalledOnce()
  })

  it('offers no manual refresh button — the data refreshes itself', async () => {
    mockCockpit({ ...LOADED_SUMMARY, openItems: 0 })
    renderCockpit()

    await screen.findByText('Erfasstes Einkommen')

    expect(screen.queryByText('Aktualisieren')).toBeNull()
  })

  it('refetches the summary when the app regains focus', async () => {
    let calls = 0
    server.use(
      http.get(COCKPIT_URL, () => {
        calls += 1
        return HttpResponse.json({ ...LOADED_SUMMARY, openItems: calls }, { status: 200 })
      }),
    )
    renderCockpit()
    await screen.findByText('1 Frage offen')

    regainFocus()

    await screen.findByText('2 Fragen offen')
    expect(calls).toBe(2)
  })

  it.each([
    ['loaded', LOADED_SUMMARY, 'Erfasstes Einkommen'],
    ['empty', null, 'Noch keine Angaben.'],
  ] as const)('shows a quiet indicator in the header while refreshing, from the %s state', async (_state, body, visibleText) => {
    mockCockpit(body)
    renderCockpit()
    await screen.findByText(visibleText)
    const release = holdNextCockpitResponse(body)

    regainFocus()

    await screen.findByLabelText('Wird aktualisiert …')
    release()
    await waitFor(() => expect(screen.queryByLabelText('Wird aktualisiert …')).toBeNull())
  })

  it('shows an honest empty state ("noch keine Angaben") when the API has no tax year yet, never mock data', async () => {
    mockCockpit(null)
    renderCockpit()

    await screen.findByText('Noch keine Angaben.')
    expect(
      screen.getByText('Für dieses Steuerjahr liegen noch keine Angaben vor. Sobald deine Daten da sind, zeigen wir dir hier dein erfasstes Einkommen.'),
    ).toBeTruthy()
    expect(screen.queryByText('Erfasstes Einkommen')).toBeNull()
  })

  it('offers "Fragen beantworten" from the empty state too — the only way a brand-new account ever reaches the Minimal-Gate', async () => {
    mockCockpit(null)
    const onOpenInterview = vi.fn()
    renderCockpit({ onOpenInterview })

    await screen.findByText('Noch keine Angaben.')
    fireEvent.click(screen.getByText('Fragen beantworten'))
    expect(onOpenInterview).toHaveBeenCalledOnce()
  })

  it('shows a retryable error state on a genuine network failure, and recovers on retry', async () => {
    mockCockpitError()
    renderCockpit()

    await screen.findByText('Das hat nicht geklappt.')
    expect(screen.getByText('Dein Cockpit konnte nicht geladen werden. Prüf die Verbindung und versuch es noch mal.')).toBeTruthy()
    expect(screen.queryByText('Erfasstes Einkommen')).toBeNull()

    mockCockpit(LOADED_SUMMARY)
    fireEvent.click(screen.getByText('Noch mal versuchen'))
    await screen.findByText('Erfasstes Einkommen')
  })

  it('treats a non-200 response as an honest error, not a silent empty/loaded fallthrough', async () => {
    server.use(http.get(COCKPIT_URL, () => HttpResponse.json(null, { status: 500 })))
    renderCockpit()

    await screen.findByText('Das hat nicht geklappt.')
  })

  it('switches to English when the locale changes (ADR-0006)', async () => {
    mockCockpit(LOADED_SUMMARY)
    renderCockpit({ lng: 'en' })

    expect(await screen.findByText('Recorded income')).toBeTruthy()
    expect(screen.getByText('6 questions still open')).toBeTruthy()
    expect(screen.getByText('Tax year')).toBeTruthy()
    expect(screen.getByText('Answer questions')).toBeTruthy()
  })

  it('renders the empty and error states in English too', async () => {
    mockCockpit(null)
    renderCockpit({ lng: 'en' })
    await screen.findByText('No details yet.')

    mockCockpitError()
    renderCockpit({ lng: 'en' })
    await screen.findByText("That didn't work.")
  })

  // --- Ticket 10.8 M3 (ADR-022/021) — Jahr-Auswahl + Übernahme-Hinweis --------------------

  it('ADR-022: die Jahr-Auswahl zeigt das aktuelle Jahr und 4 Rückjahre; ein Klick lädt das gewählte Jahr', async () => {
    mockCockpit(LOADED_SUMMARY)
    server.use(
      http.get('*/v1/steuerjahre/2025/cockpit', () =>
        HttpResponse.json({ taxYear: 2025, status: { kind: 'bestimmt', value: 42000 }, openItems: 0 }),
      ),
    )
    renderCockpit()

    // Alle 5 Jahre wählbar, das aktuelle aktiv.
    await screen.findByText('Erfasstes Einkommen')
    for (const y of [2022, 2023, 2024, 2025, 2026]) {
      expect(screen.getByTestId(`jahr-${y}`)).toBeTruthy()
    }

    // Klick auf 2025 → der Cockpit lädt das gewählte Jahr (nie „aktuelle" Werte, ADR-022).
    fireEvent.click(screen.getByTestId('jahr-2025'))
    expect(await screen.findByText('42.000 €')).toBeTruthy()
  })

  it('REQ-032: der ruhige Bestätigungs-Hinweis zitiert die Summe und nennt die Anlagen mit offenen Werten', async () => {
    mockCockpit({
      taxYear: TAX_YEAR,
      status: { kind: 'spanne', from: 0, to: 100000 + 53000, openItems: 0, conflicts: 0, unconfirmedItems: 2, unconfirmedSum: 53000 },
      openItems: 0,
    })
    server.use(
      http.get('*/v1/steuerjahre/2026/bestaetigung', () =>
        HttpResponse.json({
          annexes: [
            { annex: 'anlageN', unconfirmed: 3, values: [] },
            { annex: 'anlageKap', unconfirmed: 1, values: [] },
          ],
        }),
      ),
    )
    renderCockpit()

    expect(await screen.findByText('53.000 € warten noch auf deine Bestätigung.')).toBeTruthy()
    expect(screen.getByText('Anlage N · 3 Werte unbestätigt')).toBeTruthy()
    expect(screen.getByText('Anlage KAP · 1 Wert unbestätigt')).toBeTruthy()
  })

  it('REQ-032: „Prüfen & bestätigen“ öffnet den Bestätigungs-Screen für das gezeigte Jahr', async () => {
    mockCockpit(LOADED_SUMMARY)
    server.use(
      http.get('*/v1/steuerjahre/2026/bestaetigung', () => HttpResponse.json({ annexes: [{ annex: 'anlageR', unconfirmed: 1, values: [] }] })),
    )
    const onOpenConfirmation = vi.fn()
    renderCockpit({ onOpenConfirmation })

    fireEvent.click(await screen.findByTestId('bestaetigung-oeffnen'))
    expect(onOpenConfirmation).toHaveBeenCalledWith(TAX_YEAR)
  })

  it('REQ-032: nur offene Vorschläge (alles bestätigt) zeigen keinen Hinweis', async () => {
    mockCockpit(LOADED_SUMMARY)
    server.use(
      http.get('*/v1/steuerjahre/2026/bestaetigung', () => HttpResponse.json({ annexes: [{ annex: 'anlageN', unconfirmed: 0, values: [] }] })),
    )
    renderCockpit()

    await screen.findByText('49.880–50.120 €')
    expect(screen.queryByTestId('bestaetigung-hinweis')).toBeNull()
  })

  it('REQ-032: ohne unbestätigte Werte erscheint kein Hinweis — auch bei offener Spanne', async () => {
    mockCockpit(LOADED_SUMMARY)
    renderCockpit()

    await screen.findByText('49.880–50.120 €')
    expect(screen.queryByTestId('bestaetigung-hinweis')).toBeNull()
  })
})

describe('CockpitScreen — Formular-Ausdruck entry (ADR-0050)', () => {
  it('opens the Ausdruck for the year shown', async () => {
    mockCockpit(LOADED_SUMMARY)
    const onOpenPrintout = vi.fn()
    renderCockpit({ onOpenPrintout })
    fireEvent.click(await screen.findByTestId('cockpit-ausdruck'))
    expect(onOpenPrintout).toHaveBeenCalledWith(TAX_YEAR)
  })
})

describe('CockpitScreen — Kinder & Eulen-Modus entries', () => {
  it('opens Kinder screen when clicked', async () => {
    mockCockpit(LOADED_SUMMARY)
    const onOpenKinder = vi.fn()
    renderCockpit({ onOpenKinder })
    fireEvent.click(await screen.findByTestId('cockpit-kinder'))
    expect(onOpenKinder).toHaveBeenCalled()
  })

  it('opens Eulen-Modus screen with current tax year when clicked', async () => {
    mockCockpit(LOADED_SUMMARY)
    const onOpenOwlMode = vi.fn()
    renderCockpit({ onOpenOwlMode })
    fireEvent.click(await screen.findByTestId('cockpit-eulen-modus'))
    expect(onOpenOwlMode).toHaveBeenCalledWith(TAX_YEAR)
  })

  // Advice up front: the owl advisor card sits right under the next step, above the ghost
  // buttons — not as the last of them. Its button is `leise`, so the screen keeps one primary.
  it('shows the owl advisor card above the secondary checks', async () => {
    mockCockpit(LOADED_SUMMARY)
    renderCockpit({ onOpenOwlMode: vi.fn() })
    const card = await screen.findByTestId('cockpit-berater')
    expect(card.querySelector('[data-testid="owl-mark-tinte"]')).not.toBeNull()
    expect(card.textContent).toContain('Deine Eule berät dich')
    const check = screen.getByText('Bescheid prüfen')
    expect(card.compareDocumentPosition(check) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  describe('"Weiter mit deinem Weg" — the way back into the path once the three questions are answered', () => {
    it.each([
      [{ job: 'Angestellt', ausland: 'Ja, in die Schweiz', kinder: 'Nein' }, 'Grenzgänger CH', 'ch'],
      [{ job: 'Rente', ausland: 'Nein', kinder: 'Nein' }, 'Rente', 'rente'],
      [{ job: 'Angestellt', ausland: 'Nein', kinder: 'Nein' }, 'Angestellte', 'angestellte'],
    ] as const)('leads %o into the %s path', async (answers, label, path) => {
      mockCockpit({ ...LOADED_SUMMARY, openItems: 0 })
      mockInterview(answers)
      const onContinuePath = vi.fn()
      renderCockpit({ onContinuePath })

      fireEvent.click(await screen.findByText(`Weiter mit deinem Weg · ${label}`))

      expect(onContinuePath).toHaveBeenCalledWith(path)
    })

    it('offers it from the empty state too', async () => {
      mockCockpit(null)
      mockInterview({ job: 'Angestellt', ausland: 'Ja, in die Schweiz', kinder: 'Nein' })
      renderCockpit({ onContinuePath: () => {} })

      expect(await screen.findByText('Weiter mit deinem Weg · Grenzgänger CH')).toBeTruthy()
    })

    it('stays hidden while the three questions are not answered yet', async () => {
      mockCockpit(LOADED_SUMMARY)
      mockInterview({ job: 'Angestellt' }, false)
      renderCockpit({ onContinuePath: () => {} })

      await screen.findByText('Fragen beantworten')

      expect(screen.queryByText(/Weiter mit deinem Weg/)).toBeNull()
    })
  })
})

describe('CockpitScreen — the chosen tax year belongs to the whole app', () => {
  it('reports a year change so every following screen works on the same year', async () => {
    mockCockpit(LOADED_SUMMARY)
    const onYearChange = vi.fn()
    renderCockpit({ onYearChange })
    await screen.findByText('Erfasstes Einkommen')

    fireEvent.click(screen.getByTestId('jahr-2025'))

    expect(onYearChange).toHaveBeenCalledWith(2025)
  })

  it('opens on the year it is given, not on the current one', async () => {
    let loaded2025 = 0
    server.use(
      http.get('*/v1/steuerjahre/2025/cockpit', () => {
        loaded2025 += 1
        return HttpResponse.json(LOADED_SUMMARY, { status: 200 })
      }),
    )
    renderCockpit({ taxYear: 2025 })

    await screen.findByText('Erfasstes Einkommen')

    expect(loaded2025).toBe(1)
  })
})

describe('CockpitScreen — the personal details the return needs, asked early', () => {
  it('says how many details are still missing and opens them', async () => {
    mockCockpit(LOADED_SUMMARY)
    server.use(http.get('*/v1/stammdaten', () => HttpResponse.json({ missing: ['geburtsdatum', 'iban', 'finanzamt'] })))
    const onOpenMasterData = vi.fn()
    renderCockpit({ onOpenMasterData })

    fireEvent.click(await screen.findByText('Angaben für die Erklärung ergänzen · 3 fehlen'))

    expect(onOpenMasterData).toHaveBeenCalledOnce()
  })

  it('drops the missing count once every detail is there but keeps the way back to the details', async () => {
    mockCockpit(LOADED_SUMMARY)
    server.use(http.get('*/v1/stammdaten', () => HttpResponse.json({ missing: [] })))
    let opened = 0
    renderCockpit({ onOpenMasterData: () => (opened += 1) })

    await screen.findByText('Erfasstes Einkommen')

    expect(screen.queryByText(/Angaben für die Erklärung ergänzen/)).toBeNull()
    fireEvent.click(await screen.findByText('Angaben für die Erklärung & Partner'))
    expect(opened).toBe(1)
  })
})

describe('CockpitScreen — die voraussichtliche Erstattung als ehrliche Spanne (ADR-015)', () => {
  const ESTIMATE_URL = `*/v1/steuerjahre/${TAX_YEAR}/steuerschaetzung`

  it('shows the expected refund as a range', async () => {
    mockCockpit(LOADED_SUMMARY)
    server.use(http.get(ESTIMATE_URL, () => HttpResponse.json({ kind: 'spanne', result: { from: 312, to: 455 }, churchTaxOpen: false })))
    renderCockpit()

    expect(await screen.findByText('Voraussichtlich 312 – 455 € Erstattung')).toBeTruthy()
    expect(screen.queryByText('Die Erstattung rechnen wir in einem späteren Schritt.')).toBeNull()
  })

  it('shows a range without width as one figure, not as "31.192 – 31.192 €"', async () => {
    mockCockpit(LOADED_SUMMARY)
    server.use(http.get(ESTIMATE_URL, () => HttpResponse.json({ kind: 'spanne', result: { from: -31192, to: -31192 }, churchTaxOpen: false })))
    renderCockpit()

    expect(await screen.findByText('Voraussichtlich rund 31.192 € Nachzahlung')).toBeTruthy()
  })

  it('tells a married person to set up the joint return instead of estimating them as single (ADR-0054)', async () => {
    mockCockpit(LOADED_SUMMARY)
    server.use(http.get(ESTIMATE_URL, () => HttpResponse.json({ kind: 'offen', missing: ['veranlagungsart'] })))
    renderCockpit()
    expect(await screen.findByText(/Leg in „Angaben für die Erklärung“ die Zusammenveranlagung an/)).toBeTruthy()
  })

  it('names a back-payment as such, never as a negative refund', async () => {
    mockCockpit(LOADED_SUMMARY)
    server.use(http.get(ESTIMATE_URL, () => HttpResponse.json({ kind: 'spanne', result: { from: -21200, to: -20400 }, churchTaxOpen: true })))
    renderCockpit()

    expect(await screen.findByText('Voraussichtlich 20.400 – 21.200 € Nachzahlung')).toBeTruthy()
    expect(screen.getByText('Kirchensteuer ist in der Schätzung noch nicht enthalten.')).toBeTruthy()
  })

  it('says how many details the estimate still needs', async () => {
    mockCockpit(LOADED_SUMMARY)
    server.use(http.get(ESTIMATE_URL, () => HttpResponse.json({ kind: 'offen', missing: ['lohnsteuer', 'sozialversicherung'] })))
    renderCockpit()

    expect(await screen.findByText('Für die Schätzung fehlen noch 2 Angaben.')).toBeTruthy()
  })

  it('is honest when it cannot estimate yet', async () => {
    mockCockpit(LOADED_SUMMARY)
    server.use(http.get(ESTIMATE_URL, () => HttpResponse.json({ kind: 'nicht-moeglich', reason: 'verheiratet' })))
    renderCockpit()

    expect(await screen.findByText('Für Verheiratete rechnen wir die Erstattung noch nicht.')).toBeTruthy()
  })
})
