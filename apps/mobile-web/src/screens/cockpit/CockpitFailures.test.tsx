// WEB-45 / NC-06: a failed read in the Cockpit shows as failed, never as „offen“ or as a cockpit „wie neu“.
// The whole Cockpit (with its one write, the SubmissionMarker) fails closed when every request answers 500.
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { createAppI18n } from '../../i18n/app-i18n'
import { server } from '../../test-msw-server'
import { expectFailsClosed, failEveryRequest } from '../../test-every-query-fails'
import { CockpitScreen } from './CockpitScreen'

const TAX_YEAR = 2026
const SUMMARY = { taxYear: TAX_YEAR, openItems: 0, status: { kind: 'bestimmt' as const, value: 48000 }, submission: { status: 'eingereicht', submittedOn: '2027-03-10', withdrawable: true } }
const fail = () => HttpResponse.json({ statusCode: 500, message: 'Internal server error' }, { status: 500 })

function renderCockpit() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <CockpitScreen taxYear={TAX_YEAR} isSignedIn={true} onOpenInterview={() => {}} onOpenPrintout={() => {}} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

function useLoadedCockpit(answers: Record<string, string>) {
  server.use(
    http.get(`*/v1/steuerjahre/${TAX_YEAR}/cockpit`, () => HttpResponse.json(SUMMARY)),
    http.get(`*/v1/steuerjahre/${TAX_YEAR}/interview`, () => HttpResponse.json({ answers, nextStep: { kind: 'done' }, openItems: 0 })),
  )
}

describe('the Cockpit names what failed (WEB-45, NC-06)', () => {
  it('a failed interview read is a failed Cockpit with a retry, not a Cockpit „wie neu“', async () => {
    server.use(
      http.get(`*/v1/steuerjahre/${TAX_YEAR}/cockpit`, () => HttpResponse.json(SUMMARY)),
      http.get(`*/v1/steuerjahre/${TAX_YEAR}/interview`, fail),
    )
    renderCockpit()
    expect(await screen.findByText('Das hat nicht geklappt.')).toBeTruthy()
    expect(screen.getByText('Bei uns ist gerade etwas schiefgelaufen. Versuch es gleich noch mal.')).toBeTruthy()
    expect(screen.queryByTestId('cockpit-kacheln')).toBeNull()
    expect(screen.queryByTestId('fristen-banner-unklar')).toBeNull()
    useLoadedCockpit({ job: 'Angestellt', ausland: 'Nein', kinder: 'Nein', familienstand: 'Ledig' })
    fireEvent.click(screen.getByText('Noch mal versuchen'))
    expect(await screen.findByTestId('cockpit-kacheln')).toBeTruthy()
  })

  it('a tile whose read failed says „Nicht geladen“, not „Offen“, and the failed areas get one retry', async () => {
    useLoadedCockpit({ job: 'Angestellt', ausland: 'Nein', kinder: 'Nein', familienstand: 'Ledig' })
    server.use(http.get(`*/v1/steuerjahre/${TAX_YEAR}/arbeitsweg`, fail))
    renderCockpit()
    expect((await screen.findByTestId('cockpit-kachel-arbeitsweg-fehler')).textContent).toBe('Nicht geladen')
    expect(screen.queryByTestId('cockpit-kachel-arbeitsweg-status')).toBeNull()
    expect(screen.getByTestId('cockpit-bereiche-fehler')).toBeTruthy()
    server.use(http.get(`*/v1/steuerjahre/${TAX_YEAR}/arbeitsweg`, () => HttpResponse.json({ ways: [] })))
    fireEvent.click(screen.getByTestId('cockpit-bereiche-erneut'))
  })

  it('a failed estimate says so instead of „kommt später“', async () => {
    useLoadedCockpit({ job: 'Angestellt', ausland: 'Nein', kinder: 'Nein', familienstand: 'Ledig' })
    server.use(http.get(`*/v1/steuerjahre/${TAX_YEAR}/steuerschaetzung`, fail))
    renderCockpit()
    expect((await screen.findByTestId('cockpit-erstattung-fehler')).textContent).toBe('Die Schätzung konnte gerade nicht geladen werden.')
  })
})

describe('the Cockpit fails closed (WEB-28)', () => {
  it('with every request failing it shows a failure and sends no write (the Abgabe-Marke is not offered)', async () => {
    const failing = failEveryRequest()
    renderCockpit()
    await expectFailsClosed(failing)
  })
})
