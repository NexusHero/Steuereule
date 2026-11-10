import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { createAppI18n } from '../../i18n/app-i18n'
import { server } from '../../test-msw-server'
import { ShellStateProvider } from '../../navigation/ShellState'
import { SubmissionGateProvider } from '../../navigation/SubmissionGateContext'
import { SubmissionScreen } from './SubmissionScreen'
import type { TileId } from '../cockpit/tiles'

const TAX_YEAR = 2026

function mockCompleteLstb() {
  server.use(
    http.get(`*/v1/steuerjahre/${TAX_YEAR}/lstb`, () =>
      HttpResponse.json({
        bruttoarbeitslohn: { kind: 'erfasst', value: 50000 },
        lohnsteuer: { kind: 'erfasst', value: 8000 },
        sozialversicherung: { kind: 'erfasst', value: 9000 },
        state: { kind: 'vollstaendig', bruttoarbeitslohn: 50000, lohnsteuer: 8000, sozialversicherung: 9000 },
      }),
    ),
  )
}

function mockInterview(answers: Record<string, string>) {
  server.use(
    http.get(`*/v1/steuerjahre/${TAX_YEAR}/interview`, () =>
      HttpResponse.json({ answers, nextStep: { kind: 'done' }, openItems: 0 }),
    ),
  )
}

function renderSubmission(
  props: {
    onBack?: () => void
    onOpenTile?: (target: TileId, revisit: boolean) => void
    onOpenPrintout?: (year: number) => void
    queryClient?: QueryClient
  } = {},
) {
  const i18n = createAppI18n('de')
  const queryClient = props.queryClient ?? new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onOpenTile = props.onOpenTile ?? vi.fn()
  const onOpenPrintout = props.onOpenPrintout ?? vi.fn()
  return {
    queryClient,
    onOpenTile,
    onOpenPrintout,
    ...render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <ThemeProvider mode="light">
            <SubmissionGateProvider>
              <ShellStateProvider onRegister={() => {}} onLogin={() => {}} onSignedOut={() => {}}>
                <SubmissionScreen
                  taxYear={TAX_YEAR}
                  {...(props.onBack ? { onBack: props.onBack } : {})}
                  onOpenTile={onOpenTile}
                  onOpenPrintout={onOpenPrintout}
                />
              </ShellStateProvider>
            </SubmissionGateProvider>
          </ThemeProvider>
        </I18nextProvider>
      </QueryClientProvider>,
    ),
  }
}

describe('SubmissionScreen (§ 3.4)', () => {
  it('locks abgabe-zum-ausdruck on conflicts and navigates to the fixing tile', async () => {
    const onOpenTile = vi.fn()
    renderSubmission({ onOpenTile })

    const printBtn = await screen.findByTestId('abgabe-zum-ausdruck')
    expect((printBtn as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Lohnsteuerbescheinigung noch nicht vollständig.')).toBeTruthy()
    expect(screen.queryByTestId('gate-warnung-bestaetigen')).toBeNull()

    fireEvent.click(screen.getByTestId('abgabe-kachel-lstb'))
    expect(onOpenTile).toHaveBeenCalledWith('lstb', false)
  })

  it('requires confirming notices via gate-warnung-bestaetigen and re-prompts if a new notice kind appears', async () => {
    mockCompleteLstb()
    const answers: Record<string, string> = {
      job: 'Angestellt',
      ausland: 'Nein',
      kinder: 'Nein',
      familienstand: 'Ledig',
      dhf: 'Ja',
      'dhf-miete': 'spaeter',
    }
    mockInterview(answers)
    const onOpenTile = vi.fn()
    const onOpenPrintout = vi.fn()
    const { queryClient } = renderSubmission({ onOpenTile, onOpenPrintout })

    const printBtn = await screen.findByTestId('abgabe-zum-ausdruck')
    expect((printBtn as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByTestId('abgabe-kachel-lebenslagen'))
    expect(onOpenTile).toHaveBeenCalledWith('lebenslagen', true)

    const confirmBtn = screen.getByTestId('gate-warnung-bestaetigen')
    expect(confirmBtn.textContent).toContain('Gelesen, trotzdem weiter')
    fireEvent.click(confirmBtn)

    expect((screen.getByTestId('abgabe-zum-ausdruck') as HTMLButtonElement).disabled).toBe(false)

    // New notice kind appears (erfasst-nicht-gerechnet) -> must re-confirm
    mockInterview({ ...answers, abfindung: 'Ja', 'abfindung-betrag': '3000' })
    await queryClient.invalidateQueries()

    expect(await screen.findByTestId('gate-warnung-bestaetigen')).toBeTruthy()
    expect((screen.getByTestId('abgabe-zum-ausdruck') as HTMLButtonElement).disabled).toBe(true)
  })

  it('skips FilingTypeComparison for singles or Einzelveranlagung and allows Printout directly', async () => {
    mockCompleteLstb()
    mockInterview({ job: 'Angestellt', ausland: 'Nein', kinder: 'Nein', familienstand: 'Verheiratet' })
    server.use(
      http.get('*/v1/stammdaten', () => HttpResponse.json({ missing: [], familienstand: 'verheiratet' })),
      http.get(`*/v1/steuerjahre/${TAX_YEAR}/kopplung`, () =>
        HttpResponse.json({ filingType: 'einzel', personBUserId: null, invitationCode: null, personB: null }),
      ),
    )

    const onOpenPrintout = vi.fn()
    renderSubmission({ onOpenPrintout })

    const printBtn = await screen.findByTestId('abgabe-zum-ausdruck')
    expect((printBtn as HTMLButtonElement).disabled).toBe(false)
    expect(screen.queryByTestId('abgabe-vergleich-abschnitt')).toBeNull()
    expect(screen.queryByTestId('verheiratet-ja')).toBeNull()

    fireEvent.click(printBtn)
    expect(onOpenPrintout).toHaveBeenCalledWith(TAX_YEAR)
  })

  it('embeds FilingTypeComparison only for Zusammenveranlagung and allows skipping or completing before Printout', async () => {
    mockCompleteLstb()
    mockInterview({ job: 'Angestellt', ausland: 'Nein', kinder: 'Nein', familienstand: 'Verheiratet' })
    server.use(
      http.get('*/v1/stammdaten', () => HttpResponse.json({ missing: [], familienstand: 'verheiratet' })),
      http.get(`*/v1/steuerjahre/${TAX_YEAR}/kopplung`, () =>
        HttpResponse.json({ filingType: 'zusammen', personBUserId: null, invitationCode: null, personB: null }),
      ),
    )

    const onOpenPrintout = vi.fn()
    renderSubmission({ onOpenPrintout })

    expect(await screen.findByTestId('abgabe-vergleich-abschnitt')).toBeTruthy()
    expect(screen.getByTestId('verheiratet-ja')).toBeTruthy()
    expect((screen.getByTestId('abgabe-zum-ausdruck') as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByTestId('abgabe-vergleich-ueberspringen'))
    const printBtn = screen.getByTestId('abgabe-zum-ausdruck') as HTMLButtonElement
    expect(printBtn.disabled).toBe(false)
    fireEvent.click(printBtn)
    expect(onOpenPrintout).toHaveBeenCalledWith(TAX_YEAR)
  })
})
