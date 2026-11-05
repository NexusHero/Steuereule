import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import type { KopplungResponseDto, StammdatenResponseDto } from '@steuereule/api-client'
import { createAppI18n } from '../../i18n/app-i18n'
import { server } from '../../test-msw-server'
import { StammdatenScreen } from './StammdatenScreen'

const LEER: StammdatenResponseDto = {
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
  fehlend: ['geburtsdatum', 'strasse', 'hausnummer', 'plz', 'wohnort', 'religion', 'familienstand', 'iban', 'finanzamt'],
}

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <StammdatenScreen onZurueck={() => {}} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

function eingabe(testId: string, wert: string) {
  fireEvent.change(screen.getByTestId(testId), { target: { value: wert } })
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
        return HttpResponse.json({ ...LEER, geburtsdatum: '1990-04-12', religion: 'EV', fehlend: [] })
      }),
    )
    renderScreen()
    await screen.findByText('Für den Ausdruck fehlen noch 9 Angaben.')
    eingabe('stammdaten-geburtsdatum', '12.4.1990')
    fireEvent.click(screen.getByText('evangelisch'))
    fireEvent.click(screen.getByTestId('stammdaten-einwilligung'))
    fireEvent.click(screen.getByTestId('stammdaten-speichern'))

    await waitFor(() => expect(body).toMatchObject({ geburtsdatum: '1990-04-12', religion: 'EV', religionEinwilligung: true }))
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
    eingabe('stammdaten-iban', 'DE00')
    fireEvent.click(screen.getByTestId('stammdaten-speichern'))
    expect(await screen.findByText('Bitte prüf deine Eingaben — z. B. Datum, Postleitzahl oder IBAN.')).toBeTruthy()
  })

  describe('Kopplung (Zusammenveranlagung)', () => {
    const VERHEIRATET: StammdatenResponseDto = { ...LEER, familienstand: 'verheiratet' }
    const ZUSAMMEN: KopplungResponseDto = {
      veranlagungsart: 'zusammen',
      personBUserId: 'spouse_user-a_2025',
      einladungsCode: '9F3A0C71B2E4D658',
      personBHatEigenesKonto: false,
      personB: { firstName: 'Bea', lastName: 'Muster', steuerId: null, geburtsdatum: null, religion: null, beruf: null },
    }

    it('lets Person A fill in a partner who has no own account yet', async () => {
      server.use(
        http.get('*/v1/stammdaten', () => HttpResponse.json(VERHEIRATET)),
        http.get('*/v1/steuerjahre/:jahr/kopplung', () => HttpResponse.json(ZUSAMMEN)),
      )
      renderScreen()
      expect(await screen.findByTestId('personb-vorname')).toBeTruthy()
    })

    it('names how long the invite code is valid, and when it has expired', async () => {
      server.use(
        http.get('*/v1/stammdaten', () => HttpResponse.json(VERHEIRATET)),
        http.get('*/v1/steuerjahre/:jahr/kopplung', () =>
          HttpResponse.json({ ...ZUSAMMEN, einladungsCodeGueltigBis: '2999-01-14T10:00:00.000Z' }),
        ),
      )
      renderScreen()
      expect(await screen.findByText('Einladungscode für Partner-Account: 9F3A0C71B2E4D658 (gültig bis 14.01.2999)')).toBeTruthy()
    })

    it('says an expired invite code is expired instead of showing it', async () => {
      server.use(
        http.get('*/v1/stammdaten', () => HttpResponse.json(VERHEIRATET)),
        http.get('*/v1/steuerjahre/:jahr/kopplung', () =>
          HttpResponse.json({ ...ZUSAMMEN, einladungsCodeGueltigBis: '2000-01-01T00:00:00.000Z' }),
        ),
      )
      renderScreen()
      expect(await screen.findByText(/Einladungscode ist abgelaufen/)).toBeTruthy()
      expect(screen.queryByText(/9F3A0C71B2E4D658/)).toBeNull()
    })

    it("shows a joined partner's data read-only — it is theirs to change", async () => {
      server.use(
        http.get('*/v1/stammdaten', () => HttpResponse.json(VERHEIRATET)),
        http.get('*/v1/steuerjahre/:jahr/kopplung', () =>
          HttpResponse.json({ ...ZUSAMMEN, personBUserId: 'user-b', einladungsCode: null, personBHatEigenesKonto: true }),
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
