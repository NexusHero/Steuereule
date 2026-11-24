// ADR-0101 §16: a year with self-employment is filed through Mein ELSTER. The pre-filing check follows the switch,
// the cockpit and the Abgabe lead to the fill-in help, the checkout returns to it.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { createAppI18n } from '../../i18n/app-i18n'
import { server } from '../../test-msw-server'
import { ShellStateProvider } from '../../navigation/ShellState'
import { SubmissionGateProvider } from '../../navigation/SubmissionGateContext'
import { SubmissionScreen } from '../submission/SubmissionScreen'
import { CockpitScreen } from '../cockpit/CockpitScreen'
import { usePlausibility } from '../plausibility/usePlausibility'
import { renderBusiness, useBusinessDefaults, useElsterForms, BASE_URL } from './businessTestKit'

const YEAR = 2025
const ANSWERS = { job: 'Selbstständig', ausland: 'Nein', kinder: 'Nein', familienstand: 'Ledig' }

function mockYear(selbststaendig: boolean, filingPath: 'papier' | 'elster-ausfuellhilfe', answers: Record<string, string> = ANSWERS) {
  server.use(
    http.get(`*/v1/steuerjahre/${YEAR}/cockpit`, () => HttpResponse.json({ taxYear: YEAR, status: { kind: 'spanne', from: 0, to: 0, openItems: 0, conflicts: 0 }, openItems: 0, submission: null, capabilities: { selbststaendig }, filingPath })),
    http.get('*/v1/capabilities', () => HttpResponse.json({ selbststaendig })),
    http.get(`*/v1/steuerjahre/${YEAR}/interview`, () => HttpResponse.json({ answers, nextStep: { kind: 'done' }, openItems: 0 })),
    http.get(`*/v1/steuerjahre/${YEAR}/freischaltung`, () => HttpResponse.json({ status: 'offen', tier: 'selbststaendig', filingPath })),
  )
}

function wrap(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <SubmissionGateProvider>
            <ShellStateProvider onRegister={() => {}} onLogin={() => {}} onSignedOut={() => {}}>
              {node}
            </ShellStateProvider>
          </SubmissionGateProvider>
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

function Probe() {
  const result = usePlausibility(YEAR)
  return <Text_ status={result.status} kinds={result.conflicts.map((c) => c.kind).join(',')} />
}
function Text_({ status, kinds }: { status: string; kinds: string }) {
  return <p data-testid="probe">{`${status}|${kinds}`}</p>
}

describe('the pre-filing check with the self-employment switch', () => {
  it('asks no wage tax certificate of a pure Selbstständig when the switch is on, and still does when it is off', async () => {
    mockYear(true, 'elster-ausfuellhilfe')
    const on = wrap(<Probe />)
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toMatch(/^ready\|/))
    expect(screen.getByTestId('probe').textContent).not.toMatch(/lstb/)
    on.unmount()
    mockYear(false, 'papier')
    wrap(<Probe />)
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toMatch(/^ready\|/))
    expect(screen.getByTestId('probe').textContent).toMatch(/lstb/)
  })
})

describe('the way forward of a year filed through Mein ELSTER', () => {
  it('leads the Abgabe to the fill-in help, with one line why', async () => {
    mockYear(true, 'elster-ausfuellhilfe')
    const onOpenElsterHelp = vi.fn()
    wrap(<SubmissionScreen taxYear={YEAR} onOpenTile={() => {}} onOpenPrintout={() => {}} onOpenElsterHelp={onOpenElsterHelp} />)
    expect(await screen.findByTestId('abgabe-elster-hinweis')).toBeTruthy()
    expect(screen.queryByTestId('abgabe-zum-ausdruck')).toBeNull()
    fireEvent.click(screen.getByTestId('abgabe-zur-ausfuellhilfe'))
    expect(onOpenElsterHelp).toHaveBeenCalledWith(YEAR)
  })

  it('keeps the printout for a paper year', async () => {
    mockYear(true, 'papier')
    wrap(<SubmissionScreen taxYear={YEAR} onOpenTile={() => {}} onOpenPrintout={() => {}} onOpenElsterHelp={() => {}} />)
    expect(await screen.findByTestId('abgabe-zum-ausdruck')).toBeTruthy()
    expect(screen.queryByTestId('abgabe-elster-hinweis')).toBeNull()
  })

  it('says it in the cockpit, too', async () => {
    mockYear(true, 'elster-ausfuellhilfe')
    wrap(<CockpitScreen taxYear={YEAR} isSignedIn onOpenInterview={() => {}} onOpenElsterHelp={() => {}} />)
    expect(await screen.findByTestId('cockpit-elster-hinweis')).toBeTruthy()
  })
})

describe('back from the checkout', () => {
  it('says plainly that unlocking was cancelled (?zahlung=abbruch)', async () => {
    useBusinessDefaults()
    useElsterForms()
    server.use(http.get(`${BASE_URL}/elster/anlage-euer`, () => HttpResponse.json({ form: 'anlage-euer', year: YEAR, status: 'published', note: null, sourceUrl: null, lineNumbersAvailable: true, lines: [] })))
    server.use(http.get(`*/v1/steuerjahre/${YEAR}/freischaltung`, () => HttpResponse.json({ status: 'offen', tier: 'selbststaendig' })))
    renderBusiness('elster', { payment: 'abbruch' })
    expect(await screen.findByTestId('elster-abgebrochen')).toBeTruthy()
    expect(screen.queryByTestId('elster-freigeschaltet')).toBeNull()
  })
})
