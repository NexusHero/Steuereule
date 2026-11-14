import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NavigationContainer } from '@react-navigation/native'
import { http, HttpResponse } from 'msw'
import { createAppI18n } from '../../i18n/app-i18n'
import { server } from '../../test-msw-server'
import { ShellStateProvider } from '../../navigation/ShellState'
import { CockpitStack } from '../../navigation/CockpitStack'
import { linking } from '../../navigation/linking'
import { AuthClientProvider } from '../../auth/AuthClientProvider'
import { createAppAuthClient } from '../../auth/auth-client'
import { CockpitScreen, type CockpitScreenProps } from './CockpitScreen'

const TAX_YEAR = 2026

const LOADED_SUMMARY = {
  openItems: 0,
  status: { kind: 'bestimmt' as const, value: 48000 },
}

function renderCockpit(props: Partial<CockpitScreenProps> = {}) {
  const i18n = createAppI18n('de')
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider mode="light">
          <CockpitScreen taxYear={TAX_YEAR} isSignedIn={true} {...props} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

function mockDoneInterview(answers: Record<string, string>) {
  server.use(
    http.get(`*/v1/steuerjahre/${TAX_YEAR}/cockpit`, () => HttpResponse.json(LOADED_SUMMARY, { status: 200 })),
    http.get(`*/v1/steuerjahre/${TAX_YEAR}/steuerschaetzung`, () =>
      HttpResponse.json({ kind: 'offen', missing: ['lohnsteuer'] }, { status: 200 }),
    ),
    http.get(`*/v1/steuerjahre/${TAX_YEAR}/interview`, () =>
      HttpResponse.json({ answers, nextStep: { kind: 'done' }, openItems: 0 }, { status: 200 }),
    ),
  )
}

describe('Cockpit Screen — Slice 5 Persona Boosters & Dual Cockpit', () => {
  it('shows Erstatten heading and reveals non-persona tiles only when Weitere Themen is expanded', async () => {
    mockDoneInterview({ job: 'Angestellt', ausland: 'Nein', kinder: 'Nein', familienstand: 'Ledig' })
    const onOpenTile = vi.fn()
    renderCockpit({ onOpenTile })

    expect((await screen.findByTestId('cockpit-booster-ueberschrift')).textContent).toBe('Erstattung erhöhen')
    expect(screen.getByTestId('cockpit-kachel-lstb')).toBeTruthy()
    expect(screen.getByTestId('cockpit-kachel-arbeitsweg')).toBeTruthy()
    expect(screen.queryByTestId('cockpit-kachel-kapital')).toBeNull()
    expect(screen.queryByTestId('cockpit-kachel-vermietung')).toBeNull()
    // The § 35a and § 33 boosters are on (ADR-0077): household costs concern everyone and sit up front;
    // medical costs only for pensioners and parents, otherwise under „Weitere Themen“.
    expect(screen.getByTestId('cockpit-kachel-haushalt')).toBeTruthy()
    expect(screen.queryByTestId('cockpit-kachel-gesundheit')).toBeNull()

    const moreToggle = screen.getByTestId('cockpit-weitere-themen')
    expect(moreToggle.textContent).toContain('Weitere Themen')
    fireEvent.click(moreToggle)

    const capitalTile = await screen.findByTestId('cockpit-kachel-kapital')
    expect(screen.getByTestId('cockpit-kachel-vermietung')).toBeTruthy()
    expect(screen.getByTestId('cockpit-kachel-gesundheit')).toBeTruthy()

    fireEvent.click(capitalTile)
    expect(onOpenTile).toHaveBeenCalledWith(expect.objectContaining({ id: 'kapital' }), false)
  })

  it('shows Nachzahlung senken heading and CH main tiles for grenzgaenger', async () => {
    mockDoneInterview({ job: 'Angestellt', ausland: 'Ja, in die Schweiz', kinder: 'Nein', familienstand: 'Ledig' })
    renderCockpit()

    expect((await screen.findByTestId('cockpit-booster-ueberschrift')).textContent).toBe('Nachzahlung senken')
    expect(screen.getByTestId('cockpit-kachel-ch')).toBeTruthy()
    expect(screen.queryByTestId('cockpit-kachel-lstb')).toBeNull()
  })

  it('shows alleinerziehend tile in main section for single parents', async () => {
    mockDoneInterview({ job: 'Angestellt', ausland: 'Nein', kinder: '1 Kind', familienstand: 'Geschieden oder getrennt' })
    renderCockpit()

    expect(await screen.findByTestId('cockpit-kachel-kinder')).toBeTruthy()
    expect(screen.getByTestId('cockpit-kachel-alleinerziehend')).toBeTruthy()
  })

  it('renders Du and Partner sections with partner tiles and statuses for verheiratet + zusammen', async () => {
    mockDoneInterview({ job: 'Angestellt', ausland: 'Nein', kinder: 'Nein', familienstand: 'Verheiratet' })
    server.use(
      http.get('*/v1/stammdaten', () => HttpResponse.json({ familienstand: 'verheiratet', missing: [] })),
      http.get(`*/v1/steuerjahre/${TAX_YEAR}/kopplung`, () =>
        HttpResponse.json({
          filingType: 'zusammen',
          personBUserId: null,
          invitationCode: null,
          personBHasOwnAccount: false,
          personB: { firstName: 'Sabine', lastName: 'Weber', steuerId: null, geburtsdatum: null, religion: null, religionConsent: false, beruf: null },
        }),
      ),
      http.get(`*/v1/steuerjahre/${TAX_YEAR}/lstb`, ({ request }) => {
        const person = new URL(request.url).searchParams.get('person')
        if (person === 'B') {
          return HttpResponse.json({
            bruttoarbeitslohn: { kind: 'erfasst', value: 42000 },
            lohnsteuer: { kind: 'erfasst', value: 6000 },
            sozialversicherung: { kind: 'erfasst', value: 8400 },
            state: { kind: 'vollstaendig', bruttoarbeitslohn: 42000, lohnsteuer: 6000, sozialversicherung: 8400 },
          })
        }
        return HttpResponse.json({
          bruttoarbeitslohn: { kind: 'offen' },
          lohnsteuer: { kind: 'offen' },
          sozialversicherung: { kind: 'offen' },
          state: { kind: 'unvollstaendig', open: ['bruttoarbeitslohn'], unclear: [] },
        })
      }),
    )

    const onOpenPartner = vi.fn()
    renderCockpit({ onOpenPartner })

    expect((await screen.findByTestId('cockpit-bereich-du')).textContent).toBe('Du')
    expect((await screen.findByTestId('cockpit-bereich-partner')).textContent).toBe('Sabine')
    expect((await screen.findByTestId('partner-lstb-status')).textContent).toBe('Erledigt')
    expect((await screen.findByTestId('partner-arbeitsweg-status')).textContent).toBe('Offen')

    fireEvent.click(screen.getByTestId('partner-lstb'))
    expect(onOpenPartner).toHaveBeenCalledWith('lstb', 'Sabine')

    fireEvent.click(screen.getByTestId('partner-arbeitsweg'))
    expect(onOpenPartner).toHaveBeenCalledWith('arbeitsweg', 'Sabine')
  })

  it('shows only the pension tile for a retired Person B, and the Swiss certificate for a Grenzgänger B (ADR-0088)', async () => {
    const coupling = http.get(`*/v1/steuerjahre/${TAX_YEAR}/kopplung`, () =>
      HttpResponse.json({ filingType: 'zusammen', personBUserId: null, invitationCode: null, personBHasOwnAccount: false, personB: { firstName: 'Sabine', lastName: 'Weber', steuerId: null, geburtsdatum: null, religion: null, religionConsent: false, beruf: null } }),
    )
    mockDoneInterview({ job: 'Angestellt', ausland: 'Nein', kinder: 'Nein', familienstand: 'Verheiratet', 'partner-job': 'Rente' })
    server.use(http.get('*/v1/stammdaten', () => HttpResponse.json({ familienstand: 'verheiratet', missing: [] })), coupling)
    const onOpenPartner = vi.fn()
    const first = renderCockpit({ onOpenPartner })
    fireEvent.click(await screen.findByTestId('partner-rente'))
    expect(onOpenPartner).toHaveBeenCalledWith('rente', 'Sabine')
    expect(screen.queryByTestId('partner-lstb')).toBeNull()
    expect(screen.queryByTestId('partner-schweiz')).toBeNull()
    first.unmount()

    mockDoneInterview({ job: 'Angestellt', ausland: 'Nein', kinder: 'Nein', familienstand: 'Verheiratet', 'partner-job': 'Angestellt', 'partner-ausland': 'Ja, in die Schweiz' })
    renderCockpit({ onOpenPartner })
    expect(await screen.findByTestId('partner-schweiz')).toBeTruthy()
    expect(screen.getByTestId('partner-lstb')).toBeTruthy()
    expect(screen.queryByTestId('partner-rente')).toBeNull()
  })

  it('hides Dual Cockpit partner section when filingType is einzel', async () => {
    mockDoneInterview({ job: 'Angestellt', ausland: 'Nein', kinder: 'Nein', familienstand: 'Verheiratet' })
    server.use(
      http.get('*/v1/stammdaten', () => HttpResponse.json({ familienstand: 'verheiratet', missing: [] })),
      http.get(`*/v1/steuerjahre/${TAX_YEAR}/kopplung`, () =>
        HttpResponse.json({
          filingType: 'einzel',
          personBUserId: null,
          invitationCode: null,
          personBHasOwnAccount: false,
          personB: { firstName: 'Sabine', lastName: 'Weber', steuerId: null, geburtsdatum: null, religion: null, religionConsent: false, beruf: null },
        }),
      ),
    )

    renderCockpit()

    await screen.findByTestId('cockpit-kacheln')
    expect(screen.queryByTestId('cockpit-bereich-du')).toBeNull()
    expect(screen.queryByTestId('cockpit-bereich-partner')).toBeNull()
    expect(screen.queryByTestId('partner-lstb')).toBeNull()
  })

  it('opens Partner route from Dual Cockpit without partner name in URL and returns to CockpitHome on Back', async () => {
    server.use(
      http.get('*/api/auth/get-session', () =>
        HttpResponse.json({
          user: { id: 'u1', email: 'thomas@beispiel.de', name: 'Thomas' },
          session: { id: 's1' },
        }),
      ),
      http.get(`*/v1/steuerjahre/*/cockpit`, () => HttpResponse.json(LOADED_SUMMARY, { status: 200 })),
      http.get(`*/v1/steuerjahre/*/steuerschaetzung`, () =>
        HttpResponse.json({ kind: 'offen', missing: ['lohnsteuer'] }, { status: 200 }),
      ),
      http.get(`*/v1/steuerjahre/*/interview`, () =>
        HttpResponse.json(
          { answers: { job: 'Angestellt', ausland: 'Nein', kinder: 'Nein', familienstand: 'Verheiratet' }, nextStep: { kind: 'done' }, openItems: 0 },
          { status: 200 },
        ),
      ),
      http.get('*/v1/stammdaten', () => HttpResponse.json({ familienstand: 'verheiratet', missing: [] })),
      http.get(`*/v1/steuerjahre/*/kopplung`, () =>
        HttpResponse.json({
          filingType: 'zusammen',
          personBUserId: null,
          invitationCode: null,
          personBHasOwnAccount: false,
          personB: { firstName: 'Sabine', lastName: 'Weber', steuerId: null, geburtsdatum: null, religion: null, religionConsent: false, beruf: null },
        }),
      ),
    )

    const urls: string[] = []
    const authClient = createAppAuthClient('http://localhost:3000')
    const i18n = createAppI18n('de')
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <ThemeProvider mode="light">
            <AuthClientProvider client={authClient}>
              <ShellStateProvider onRegister={() => {}} onLogin={() => {}} onSignedOut={() => {}}>
                <NavigationContainer
                  linking={linking}
                  onStateChange={(state) => {
                    urls.push(JSON.stringify(state))
                  }}
                >
                  <CockpitStack />
                </NavigationContainer>
              </ShellStateProvider>
            </AuthClientProvider>
          </ThemeProvider>
        </I18nextProvider>
      </QueryClientProvider>,
    )

    const partnerTile = await screen.findByTestId('partner-lstb')
    fireEvent.click(partnerTile)

    expect(await screen.findByText('Lohnsteuerbescheinigung von Sabine')).toBeTruthy()
    expect(urls.join(' ')).not.toContain('Sabine')

    fireEvent.click(screen.getByLabelText('Zurück'))

    await waitFor(() => {
      expect(screen.queryByText('Lohnsteuerbescheinigung von Sabine')).toBeNull()
      expect(screen.getByTestId('cockpit-bereich-partner')).toBeTruthy()
    })
  })
})
