import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import type { StammdatenResponseDto } from '@steuereule/api-client'
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
})
