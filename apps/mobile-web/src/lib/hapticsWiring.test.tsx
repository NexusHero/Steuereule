import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { ThemeProvider } from '@steuereule/ui'
import { createAppI18n } from '../i18n/app-i18n'
import { server } from '../test-msw-server'
import { ShellStateProvider } from '../navigation/ShellState'
import { SubmissionGateProvider } from '../navigation/SubmissionGateContext'
import { CockpitPartnerSection } from '../screens/cockpit/CockpitPartnerSection'
import { CockpitScreen } from '../screens/cockpit/CockpitScreen'
import { SubmissionScreen } from '../screens/submission/SubmissionScreen'
import { PlausibilityScreen } from '../screens/plausibility/PlausibilityScreen'
import { WorkdaysScreen } from '../screens/workdays/WorkdaysScreen'
import { CatalogScreen } from '../screens/catalog/CatalogScreen'
import { MasterDataScreen } from '../screens/master-data/MasterDataScreen'

const hapticSpies = vi.hoisted(() => ({
  hapticSelection: vi.fn(),
  hapticLight: vi.fn(),
  hapticMedium: vi.fn(),
  hapticSuccess: vi.fn(),
  hapticWarning: vi.fn(),
}))

vi.mock('@steuereule/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@steuereule/ui')>()
  return {
    ...actual,
    hapticSelection: () => {
      hapticSpies.hapticSelection()
      return actual.hapticSelection()
    },
    hapticLight: () => {
      hapticSpies.hapticLight()
      return actual.hapticLight()
    },
    hapticMedium: () => {
      hapticSpies.hapticMedium()
      return actual.hapticMedium()
    },
    hapticSuccess: () => {
      hapticSpies.hapticSuccess()
      return actual.hapticSuccess()
    },
    hapticWarning: () => {
      hapticSpies.hapticWarning()
      return actual.hapticWarning()
    },
  }
})

function wrap(ui: React.ReactNode, queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const i18n = createAppI18n('de')
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <ThemeProvider mode="light">{ui}</ThemeProvider>
        </I18nextProvider>
      </QueryClientProvider>,
    ),
  }
}

describe('app haptics integration (Slice 7)', () => {
  beforeEach(() => {
    hapticSpies.hapticSelection.mockReset()
    hapticSpies.hapticLight.mockReset()
    hapticSpies.hapticMedium.mockReset()
    hapticSpies.hapticSuccess.mockReset()
    hapticSpies.hapticWarning.mockReset()
  })

  it('triggers hapticSelection on tax year switch and hapticSuccess only when a tile transitions to erledigt', async () => {
    let lstbComplete = false
    server.use(
      http.get('*/v1/steuerjahre/:jahr/cockpit', ({ params }) =>
        HttpResponse.json({
          taxYear: Number(params.jahr),
          status: { kind: 'spanne', from: 50000, to: 50200, openItems: 2, conflicts: 0 },
          openItems: 2,
        }),
      ),
      http.get('*/v1/steuerjahre/:jahr/steuerschaetzung', () =>
        HttpResponse.json({ kind: 'offen', missing: ['lstb'] }),
      ),
      http.get('*/v1/steuerjahre/:jahr/interview', () =>
        HttpResponse.json({
          answers: { job: 'Angestellt', ausland: 'Nein', kinder: 'Nein', familienstand: 'Ledig' },
          nextStep: { kind: 'done' },
          openItems: 0,
        }),
      ),
      http.get('*/v1/steuerjahre/:jahr/lstb', () =>
        HttpResponse.json(
          lstbComplete
            ? {
                bruttoarbeitslohn: { kind: 'erfasst', value: 50000 },
                lohnsteuer: { kind: 'erfasst', value: 8000 },
                sozialversicherung: { kind: 'erfasst', value: 9000 },
                state: { kind: 'vollstaendig', bruttoarbeitslohn: 50000, lohnsteuer: 8000, sozialversicherung: 9000 },
              }
            : {
                bruttoarbeitslohn: { kind: 'offen' },
                lohnsteuer: { kind: 'offen' },
                sozialversicherung: { kind: 'offen' },
                state: { kind: 'unvollstaendig' },
              },
        ),
      ),
    )

    const { queryClient } = wrap(<CockpitScreen taxYear={2026} />)
    await screen.findByTestId('cockpit-kachel-lstb')
    await waitFor(() => expect(screen.getByTestId('cockpit-kachel-lstb-status').textContent).toBe('Offen'))
    expect(hapticSpies.hapticSuccess).not.toHaveBeenCalled()

    // Complete LStB on the backend and refetch -> tile transitions to erledigt -> hapticSuccess.
    lstbComplete = true
    await act(async () => {
      await queryClient.invalidateQueries()
    })
    await waitFor(() => expect(screen.getByTestId('cockpit-kachel-lstb-status').textContent).toBe('Erledigt'))
    await waitFor(() => expect(hapticSpies.hapticSuccess).toHaveBeenCalledOnce())

    // Switching tax year triggers hapticSelection (and does NOT falsely fire hapticSuccess).
    hapticSpies.hapticSuccess.mockClear()
    fireEvent.click(screen.getByTestId('jahr-2025'))
    await waitFor(() => expect(hapticSpies.hapticSelection).toHaveBeenCalledOnce())
    expect(hapticSpies.hapticSuccess).not.toHaveBeenCalled()
  })

  it('triggers hapticSuccess when a partner tile in CockpitPartnerSection transitions to erledigt', async () => {
    let partnerLstbDone = false
    let lstbRequests = 0
    server.use(
      http.get('*/v1/steuerjahre/2026/lstb', () => {
        lstbRequests += 1
        return HttpResponse.json(
          partnerLstbDone
            ? {
                bruttoarbeitslohn: { kind: 'erfasst', value: 40000 },
                lohnsteuer: { kind: 'erfasst', value: 6000 },
                sozialversicherung: { kind: 'erfasst', value: 7000 },
                state: { kind: 'vollstaendig', bruttoarbeitslohn: 40000, lohnsteuer: 6000, sozialversicherung: 7000 },
              }
            : {
                bruttoarbeitslohn: { kind: 'offen' },
                lohnsteuer: { kind: 'offen' },
                sozialversicherung: { kind: 'offen' },
                state: { kind: 'unvollstaendig' },
              },
        )
      }),
    )

    const { queryClient } = wrap(
      <CockpitPartnerSection year={2026} partnerName="Bea" enabled onOpenPartner={() => {}} />,
    )

    await waitFor(() => expect(lstbRequests).toBeGreaterThanOrEqual(1))
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
    expect(screen.getByTestId('partner-lstb-status').textContent).toBe('Offen')
    expect(hapticSpies.hapticSuccess).not.toHaveBeenCalled()

    partnerLstbDone = true
    await act(async () => {
      await queryClient.invalidateQueries()
    })

    await waitFor(() => expect(screen.getByTestId('partner-lstb-status').textContent).toBe('Erledigt'))
    await waitFor(() => expect(hapticSpies.hapticSuccess).toHaveBeenCalledOnce())
  })

  it('triggers hapticWarning when the Submission gate displays a blocking conflict', async () => {
    server.use(
      http.get('*/v1/steuerjahre/2026/lstb', () =>
        HttpResponse.json({
          bruttoarbeitslohn: { kind: 'offen' },
          lohnsteuer: { kind: 'offen' },
          sozialversicherung: { kind: 'offen' },
          state: { kind: 'unvollstaendig' },
        }),
      ),
    )

    wrap(
      <SubmissionGateProvider>
        <ShellStateProvider onRegister={() => {}} onLogin={() => {}} onSignedOut={() => {}}>
          <SubmissionScreen taxYear={2026} onOpenTile={() => {}} onOpenPrintout={() => {}} />
        </ShellStateProvider>
      </SubmissionGateProvider>,
    )

    await screen.findByText('Lohnsteuerbescheinigung noch nicht vollständig.')
    await waitFor(() => expect(hapticSpies.hapticWarning).toHaveBeenCalledOnce())
  })

  it('triggers hapticWarning when the Plausibility screen displays a blocking conflict', async () => {
    server.use(
      http.get('*/v1/steuerjahre/2026/lstb', () =>
        HttpResponse.json({
          bruttoarbeitslohn: { kind: 'offen' },
          lohnsteuer: { kind: 'offen' },
          sozialversicherung: { kind: 'offen' },
          state: { kind: 'unvollstaendig' },
        }),
      ),
    )

    wrap(<PlausibilityScreen taxYear={2026} onBack={() => {}} />)

    await screen.findByText('Lohnsteuerbescheinigung noch nicht vollständig.')
    await waitFor(() => expect(hapticSpies.hapticWarning).toHaveBeenCalledOnce())
  })

  it('triggers hapticWarning when saving Workdays fails', async () => {
    server.use(
      http.put('*/v1/steuerjahre/2026/arbeitsweg', () => HttpResponse.json({ message: 'fail' }, { status: 500 })),
    )

    wrap(<WorkdaysScreen taxYear={2026} onDone={() => {}} />)
    fireEvent.click(await screen.findByTestId('arbeitstage-weiter'))

    await screen.findByText(/nicht gespeichert/i)
    await waitFor(() => expect(hapticSpies.hapticWarning).toHaveBeenCalledOnce())
  })

  it('triggers hapticWarning when saving Catalog triggers a version conflict', async () => {
    server.use(
      http.get('*/v1/steuerjahre/2026/interview', () =>
        HttpResponse.json({ answers: {}, nextStep: { kind: 'question', id: 'dhf' }, openItems: 5 }),
      ),
      http.post('*/v1/steuerjahre/2026/interview/antworten', () =>
        HttpResponse.json({ message: 'conflict' }, { status: 409 }),
      ),
    )

    wrap(<CatalogScreen entry="lebenslagen" taxYear={2026} onDone={() => {}} />)
    fireEvent.click(await screen.findByText('Ja'))

    await waitFor(() => expect(hapticSpies.hapticWarning).toHaveBeenCalledOnce())
  })

  it('triggers hapticWarning when saving MasterData fails validation', async () => {
    server.use(
      http.get('*/v1/stammdaten', () =>
        HttpResponse.json({
          geburtsdatum: null,
          strasse: null,
          hausnummer: null,
          hausnummerZusatz: null,
          plz: null,
          wohnort: null,
          beruf: null,
          religion: null,
          familienstand: null,
          familienstandSeit: null,
          iban: null,
          kontoinhaber: null,
          finanzamt: null,
          telefon: null,
          missing: ['iban'],
        }),
      ),
      http.put('*/v1/stammdaten', () => HttpResponse.json({ message: ['iban is not a valid IBAN'] }, { status: 400 })),
    )

    wrap(<MasterDataScreen onBack={() => {}} />)
    await screen.findByText('Für den Ausdruck fehlen noch 1 Angaben.')
    fireEvent.change(screen.getByTestId('stammdaten-iban'), { target: { value: 'DE00' } })
    fireEvent.click(screen.getByTestId('stammdaten-speichern'))

    await screen.findByText('Bitte prüf deine Eingaben — z. B. Datum, Postleitzahl oder IBAN.')
    await waitFor(() => expect(hapticSpies.hapticWarning).toHaveBeenCalledOnce())
  })
})
