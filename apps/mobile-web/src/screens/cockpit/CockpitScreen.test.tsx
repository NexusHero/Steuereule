// REQ-001 (steuereule#3, T6/#93) — Cockpit hero card: refund estimate range + "N Angaben offen",
// honest loading/empty/error states, i18n de/en, exactly one primary action. Exercises the real
// generated `useCockpitControllerGetCockpitSummary` hook (@steuereule/api-client) against
// `GET /v1/steuerjahre/{jahr}/cockpit`, with MSW mocking the wire shape (contract-pinned to
// docs/runtime/req-001-cockpit-read.md; the real endpoint landed in #119).
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { createAppI18n } from '../../i18n/app-i18n'
import { CockpitScreen } from './CockpitScreen'
import { server } from '../../test-msw-server'
import type { CockpitSummaryDto } from '@steuereule/api-client'

const TAX_YEAR = 2026
const COCKPIT_URL = `*/v1/steuerjahre/${TAX_YEAR}/cockpit`

const LOADED_SUMMARY: CockpitSummaryDto = {
  taxYear: TAX_YEAR,
  estimate: { from: 1047, to: 1767 },
  openItems: 6,
}

function mockCockpit(data: CockpitSummaryDto | null, status = 200) {
  // The wire body IS the CockpitSummaryDto (or null) directly — matching the profile client's
  // convention, where the `{ data, status }` envelope is httpClient's own generic wrapper around
  // the parsed JSON, never something the server itself sends.
  server.use(http.get(COCKPIT_URL, () => HttpResponse.json(data, { status })))
}

function mockCockpitError() {
  server.use(http.get(COCKPIT_URL, () => HttpResponse.error()))
}

function renderCockpit(opts: { lng?: 'de' | 'en'; onOpenInterview?: () => void } = {}) {
  const i18n = createAppI18n(opts.lng ?? 'de')
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider mode="light">
          <CockpitScreen taxYear={TAX_YEAR} onOpenInterview={opts.onOpenInterview ?? (() => {})} />
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

    await screen.findByText('Voraussichtliche Erstattung')
    expect(screen.queryByLabelText('Dein Cockpit wird geladen …')).toBeNull()
  })

  it('renders the estimate range, tabular-nums, from the API (never hard-coded)', async () => {
    mockCockpit(LOADED_SUMMARY)
    renderCockpit()

    expect(await screen.findByText('1.047–1.767 €')).toBeTruthy()
  })

  it('shows the plural "N Angaben offen" copy read from the API', async () => {
    mockCockpit(LOADED_SUMMARY)
    renderCockpit()

    expect(await screen.findByText('6 Angaben offen')).toBeTruthy()
  })

  it('shows the singular "1 Angabe offen" copy when exactly one item is open', async () => {
    mockCockpit({ ...LOADED_SUMMARY, openItems: 1 })
    renderCockpit()

    expect(await screen.findByText('1 Angabe offen')).toBeTruthy()
  })

  it('reveals provenance (Herkunft) on tap, consistent with the shown range', async () => {
    mockCockpit(LOADED_SUMMARY)
    renderCockpit()

    await screen.findByText('Voraussichtliche Erstattung')
    fireEvent.click(screen.getByText('Herkunft'))
    expect(screen.getByText('Spannen-Regel · ADR-015')).toBeTruthy()
    expect(screen.getByText('6 offene Angaben × 60 € Unsicherheit')).toBeTruthy()
  })

  it('shows the appbar title and tax year pill', async () => {
    mockCockpit(LOADED_SUMMARY)
    renderCockpit()

    await screen.findByText('Voraussichtliche Erstattung')
    expect(screen.getByText('Steuerjahr')).toBeTruthy()
    expect(screen.getByText('2026')).toBeTruthy()
  })

  // REQ-015/#318 task 2 — the revisit this file itself announced (`:16-17`'s old comment):
  // "Fragen beantworten" is now the one primary action while items are open, routing to the
  // real Minimal-Gate; "Aktualisieren" demotes to the secondary slot alongside it rather than
  // disappearing (one primary action per screen, design-system CLAUDE.md — not "one action").
  it('shows "Fragen beantworten" as the primary CTA while items are open, and reaches the Minimal-Gate', async () => {
    mockCockpit(LOADED_SUMMARY)
    const onOpenInterview = vi.fn()
    renderCockpit({ onOpenInterview })

    await screen.findByText('Voraussichtliche Erstattung')
    expect(screen.getByText('Fragen beantworten')).toBeTruthy()
    expect(screen.getAllByText('Aktualisieren')).toHaveLength(1)

    fireEvent.click(screen.getByText('Fragen beantworten'))
    expect(onOpenInterview).toHaveBeenCalledOnce()
  })

  it('exposes exactly one primary action once loaded with nothing open — "Aktualisieren" alone', async () => {
    mockCockpit({ ...LOADED_SUMMARY, openItems: 0 })
    renderCockpit()

    await screen.findByText('Voraussichtliche Erstattung')
    expect(screen.queryByText('Fragen beantworten')).toBeNull()
    expect(screen.getAllByText('Aktualisieren')).toHaveLength(1)
  })

  it('refetches the summary when the primary action is pressed', async () => {
    let calls = 0
    server.use(
      http.get(COCKPIT_URL, () => {
        calls += 1
        return HttpResponse.json({ ...LOADED_SUMMARY, openItems: calls }, { status: 200 })
      }),
    )
    renderCockpit()

    await screen.findByText('1 Angabe offen')
    fireEvent.click(screen.getByText('Aktualisieren'))
    await screen.findByText('2 Angaben offen')
    expect(calls).toBe(2)
  })

  it('shows the "Wird aktualisiert …" label while a refresh is in flight, from the loaded state', async () => {
    mockCockpit(LOADED_SUMMARY)
    renderCockpit()
    await screen.findByText('Voraussichtliche Erstattung')

    let release: (() => void) | undefined
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.get(COCKPIT_URL, async () => {
        await pending
        return HttpResponse.json(LOADED_SUMMARY, { status: 200 })
      }),
    )
    fireEvent.click(screen.getByText('Aktualisieren'))

    await screen.findByText('Wird aktualisiert …')
    release?.()
    await screen.findByText('Aktualisieren')
  })

  it('shows the "Wird aktualisiert …" label while a refresh is in flight, from the empty state', async () => {
    mockCockpit(null)
    renderCockpit()
    await screen.findByText('Noch keine Angaben.')

    let release: (() => void) | undefined
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.get(COCKPIT_URL, async () => {
        await pending
        return HttpResponse.json(null, { status: 200 })
      }),
    )
    fireEvent.click(screen.getByText('Aktualisieren'))

    await screen.findByText('Wird aktualisiert …')
    release?.()
    await screen.findByText('Aktualisieren')
  })

  it('shows an honest empty state ("noch keine Angaben") when the API has no tax year yet, never mock data', async () => {
    mockCockpit(null)
    renderCockpit()

    await screen.findByText('Noch keine Angaben.')
    expect(
      screen.getByText('Für dieses Steuerjahr liegen noch keine Angaben vor. Sobald deine Daten da sind, zeigen wir dir hier deine Erstattung.'),
    ).toBeTruthy()
    expect(screen.queryByText('Voraussichtliche Erstattung')).toBeNull()
    expect(screen.getAllByText('Aktualisieren')).toHaveLength(1)
  })

  // Found by actually driving this screen against a fresh account (real API, real Postgres,
  // #318 task 2's own live-proof run): a brand-new account has no `TaxYear` row at all, so
  // Cockpit shows this exact empty state — without a CTA here, such an account could never
  // reach the Minimal-Gate from Cockpit. This IS "no interview answers yet" (REQ-015's GWT
  // opening clause), so the CTA belongs here too, not only once a summary already exists.
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
    expect(screen.queryByText('Voraussichtliche Erstattung')).toBeNull()

    mockCockpit(LOADED_SUMMARY)
    fireEvent.click(screen.getByText('Noch mal versuchen'))
    await screen.findByText('Voraussichtliche Erstattung')
  })

  it('treats a non-200 response as an honest error, not a silent empty/loaded fallthrough', async () => {
    server.use(http.get(COCKPIT_URL, () => HttpResponse.json(null, { status: 500 })))
    renderCockpit()

    await screen.findByText('Das hat nicht geklappt.')
  })

  it('switches to English when the locale changes (ADR-0006)', async () => {
    mockCockpit(LOADED_SUMMARY)
    renderCockpit({ lng: 'en' })

    expect(await screen.findByText('Estimated refund')).toBeTruthy()
    expect(screen.getByText('6 items still open')).toBeTruthy()
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
})
