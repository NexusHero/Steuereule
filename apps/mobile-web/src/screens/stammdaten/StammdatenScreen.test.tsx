import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import type { LinkResponseDto, MasterDataResponseDto } from '@steuereule/api-client'
import { createAppI18n } from '../../i18n/app-i18n'
import { server } from '../../test-msw-server'
import { MasterDataScreen } from './StammdatenScreen'

const LEER: MasterDataResponseDto = {
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
  missing: ['geburtsdatum', 'strasse', 'hausnummer', 'plz', 'wohnort', 'religion', 'familienstand', 'iban', 'finanzamt'],
}

function renderScreen(taxYear?: number) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <MasterDataScreen onBack={() => {}} {...(taxYear ? { taxYear } : {})} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

function input(testId: string, value: string) {
  fireEvent.change(screen.getByTestId(testId), { target: { value } })
}

afterEach(() => server.resetHandlers())

describe('StammdatenScreen (ADR-0050)', () => {
  it('names how many details the printout still needs', async () => {
    server.use(http.get('*/v1/stammdaten', () => HttpResponse.json(LEER)))
    renderScreen()
    expect(await screen.findByText('Für den Ausdruck fehlen noch 9 Angaben.')).toBeTruthy()
  })

  it('does not send a religion without the Art. 9 consent tick', async () => {
    let puts = 0
    server.use(
      http.get('*/v1/stammdaten', () => HttpResponse.json(LEER)),
      http.put('*/v1/stammdaten', () => {
        puts += 1
        return HttpResponse.json(LEER)
      }),
    )
    renderScreen()
    fireEvent.click(await screen.findByText('evangelisch'))
    fireEvent.click(screen.getByTestId('stammdaten-speichern'))

    expect(await screen.findByText('Ohne deine Einwilligung können wir die Religion nicht speichern.')).toBeTruthy()
    expect(puts).toBe(0)
  })

  it('sends German dates as ISO, with consent, and shows the saved state', async () => {
    let body: Record<string, unknown> = {}
    server.use(
      http.get('*/v1/stammdaten', () => HttpResponse.json(LEER)),
      http.put('*/v1/stammdaten', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ ...LEER, geburtsdatum: '1990-04-12', religion: 'EV', missing: [] })
      }),
    )
    renderScreen()
    await screen.findByText('Für den Ausdruck fehlen noch 9 Angaben.')
    input('stammdaten-geburtsdatum', '12.4.1990')
    fireEvent.click(screen.getByText('evangelisch'))
    fireEvent.click(screen.getByTestId('stammdaten-einwilligung'))
    fireEvent.click(screen.getByTestId('stammdaten-speichern'))

    await waitFor(() => expect(body).toMatchObject({ geburtsdatum: '1990-04-12', religion: 'EV', religionConsent: true }))
    expect(await screen.findByText('Gespeichert.')).toBeTruthy()
    expect(await screen.findByText('Alles da für den Ausdruck.')).toBeTruthy()
  })

  it('a rejected save (e.g. wrong IBAN) is named, not swallowed', async () => {
    server.use(
      http.get('*/v1/stammdaten', () => HttpResponse.json(LEER)),
      http.put('*/v1/stammdaten', () => HttpResponse.json({ message: ['iban is not a valid IBAN'] }, { status: 400 })),
    )
    renderScreen()
    await screen.findByText('Für den Ausdruck fehlen noch 9 Angaben.')
    input('stammdaten-iban', 'DE00')
    fireEvent.click(screen.getByTestId('stammdaten-speichern'))
    expect(await screen.findByText('Bitte prüf deine Eingaben — z. B. Datum, Postleitzahl oder IBAN.')).toBeTruthy()
  })

  describe('Kopplung (Zusammenveranlagung)', () => {
    const MARRIED: MasterDataResponseDto = { ...LEER, familienstand: 'verheiratet' }
    const JOINT: LinkResponseDto = {
      veranlagungsart: 'zusammen',
      personBUserId: 'spouse_user-a_2025',
      einladungsCode: '9F3A0C71B2E4D658',
      personBHasOwnAccount: false,
      personB: { firstName: 'Bea', lastName: 'Muster', steuerId: null, geburtsdatum: null, religion: null, beruf: null },
    }

    it('lets Person A fill in a partner who has no own account yet', async () => {
      server.use(
        http.get('*/v1/stammdaten', () => HttpResponse.json(MARRIED)),
        http.get('*/v1/steuerjahre/:jahr/kopplung', () => HttpResponse.json(JOINT)),
      )
      renderScreen()
      expect(await screen.findByTestId('personb-vorname')).toBeTruthy()
    })

    it('names how long the invite code is valid, and when it has expired', async () => {
      server.use(
        http.get('*/v1/stammdaten', () => HttpResponse.json(MARRIED)),
        http.get('*/v1/steuerjahre/:jahr/kopplung', () =>
          HttpResponse.json({ ...JOINT, einladungsCodeGueltigBis: '2999-01-14T10:00:00.000Z' }),
        ),
      )
      renderScreen()
      expect(await screen.findByText('Einladungscode für Partner-Account: 9F3A0C71B2E4D658 (gültig bis 14.01.2999)')).toBeTruthy()
    })

    it('says an expired invite code is expired instead of showing it', async () => {
      server.use(
        http.get('*/v1/stammdaten', () => HttpResponse.json(MARRIED)),
        http.get('*/v1/steuerjahre/:jahr/kopplung', () =>
          HttpResponse.json({ ...JOINT, einladungsCodeGueltigBis: '2000-01-01T00:00:00.000Z' }),
        ),
      )
      renderScreen()
      expect(await screen.findByText(/Einladungscode ist abgelaufen/)).toBeTruthy()
      expect(screen.queryByText(/9F3A0C71B2E4D658/)).toBeNull()
    })

    it("opens the partner's masks while the partner has no own account", async () => {
      server.use(
        http.get('*/v1/stammdaten', () => HttpResponse.json(MARRIED)),
        http.get('*/v1/steuerjahre/:jahr/kopplung', () => HttpResponse.json(JOINT)),
      )
      const opened: string[] = []
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      render(
        <QueryClientProvider client={queryClient}>
          <I18nextProvider i18n={createAppI18n('de')}>
            <ThemeProvider mode="light">
              <MasterDataScreen onBack={() => {}} taxYear={2025} onRecordPartner={(area, name) => opened.push(`${area}:${name}`)} />
            </ThemeProvider>
          </I18nextProvider>
        </QueryClientProvider>,
      )
      fireEvent.click(await screen.findByText('Lohnsteuerbescheinigung von Bea erfassen'))
      fireEvent.click(screen.getByText('Arbeitsweg von Bea erfassen'))
      expect(opened).toEqual(['lstb:Bea', 'arbeitsweg:Bea'])
    })

    it('sets the Veranlagungsart for the tax year the cockpit shows, not the current one', async () => {
      const set: string[] = []
      server.use(
        http.get('*/v1/stammdaten', () => HttpResponse.json(MARRIED)),
        http.get('*/v1/steuerjahre/:jahr/kopplung', () => HttpResponse.json({ veranlagungsart: 'keine' })),
        http.put('*/v1/steuerjahre/:jahr/kopplung', ({ params }) => {
          set.push(String(params.jahr))
          return HttpResponse.json(JOINT)
        }),
      )
      renderScreen(2025)
      expect(await screen.findByText(/Veranlagungsart 2025/)).toBeTruthy()
      fireEvent.click(screen.getByTestId('kopplung-zusammen'))
      await waitFor(() => expect(set).toEqual(['2025']))
    })

    it('lets the invited partner redeem the code, and says plainly when it is unknown', async () => {
      const codes: string[] = []
      server.use(
        http.get('*/v1/stammdaten', () => HttpResponse.json(MARRIED)),
        http.get('*/v1/steuerjahre/:jahr/kopplung', () => HttpResponse.json({ veranlagungsart: 'keine' })),
        http.post('*/v1/steuerjahre/:jahr/kopplung/beitreten/:code', ({ params }) => {
          codes.push(`${String(params.jahr)}:${String(params.code)}`)
          return HttpResponse.json({ code: 'INVITATION_CODE_INVALID', message: 'The invitation code is invalid.' }, { status: 404 })
        }),
      )
      renderScreen(2025)
      fireEvent.change(await screen.findByTestId('kopplung-code'), { target: { value: ' c39b4e995366e74a ' } })
      fireEvent.click(screen.getByTestId('kopplung-beitreten'))

      await waitFor(() => expect(codes).toEqual(['2025:C39B4E995366E74A']))
      expect(await screen.findByText('Diesen Code kennen wir nicht. Prüf die Schreibweise.')).toBeTruthy()
    })

    it("shows a joined partner's data read-only — it is theirs to change", async () => {
      server.use(
        http.get('*/v1/stammdaten', () => HttpResponse.json(MARRIED)),
        http.get('*/v1/steuerjahre/:jahr/kopplung', () =>
          HttpResponse.json({ ...JOINT, personBUserId: 'user-b', einladungsCode: null, personBHasOwnAccount: true }),
        ),
      )
      renderScreen()
      expect(await screen.findByText(/Bea Muster pflegt die Angaben im eigenen Konto/)).toBeTruthy()
      expect(screen.queryByTestId('personb-vorname')).toBeNull()
      expect(screen.queryByTestId('personb-speichern')).toBeNull()
    })
  })

  it('gives every text field a name screen readers can announce', async () => {
    server.use(http.get('*/v1/stammdaten', () => HttpResponse.json(LEER)))
    renderScreen()

    expect(await screen.findByLabelText('Geburtsdatum (TT.MM.JJJJ)')).toBeTruthy()
    expect(screen.getByLabelText('IBAN für die Erstattung')).toBeTruthy()
    expect(screen.getByLabelText('Zuständiges Finanzamt')).toBeTruthy()
  })
})
