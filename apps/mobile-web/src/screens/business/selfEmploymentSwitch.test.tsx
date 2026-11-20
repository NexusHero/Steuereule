// ADR-0101 §20: the server's switch decides whether the Gewerbe gate stops the self-employed. With the
// switch off the interview and the cockpit look exactly as before (their own suites pin that); with it
// on, „Selbstständig“ and „Beides“ walk on and the cockpit offers the area as a tile.
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import type { CockpitSummaryDto } from '@steuereule/api-client'
import { createAppI18n } from '../../i18n/app-i18n'
import { InterviewScreen } from '../interview/InterviewScreen'
import { CockpitScreen } from '../cockpit/CockpitScreen'
import { partitionTiles, TILES, tileById, type TileFacts } from '../cockpit/tiles'
import { server } from '../../test-msw-server'
import { BasisPage } from '../strom/StromPages'
import { StromOptionsContext } from '../strom/stromOptions'
import { BASE_PROFILE } from './businessTestKit'

const YEAR = 2026

function summary(selbststaendig: boolean): CockpitSummaryDto {
  return {
    taxYear: YEAR,
    status: { kind: 'spanne', from: 0, to: 0, openItems: 0, conflicts: 0 },
    openItems: 0,
    submission: null,
    capabilities: { selbststaendig },
  }
}

function mount(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">{node}</ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

describe('the self-employment switch in the interview', () => {
  it('walks on from „Selbstständig“ to the next question when the switch is on', async () => {
    server.use(http.get(`*/v1/steuerjahre/${YEAR}/cockpit`, () => HttpResponse.json(summary(true))))
    mount(<InterviewScreen taxYear={YEAR} onDone={() => {}} />)
    await screen.findByText('Mehrfachjobs? Nimm die Hauptquelle — der Rest kommt später.')
    fireEvent.click(screen.getByText('Selbstständig'))
    await screen.findByText('Wer in Deutschland wohnt und in der Schweiz arbeitet, hat eigene Regeln — die gehen wir komplett mit dir durch.')
    expect(screen.queryByText('Ehrlich: dafür sind wir noch nicht gut genug.')).toBeNull()
  })

  it('„Beides“ leads on into the employee part without the gate when the switch is on', async () => {
    server.use(http.get(`*/v1/steuerjahre/${YEAR}/cockpit`, () => HttpResponse.json(summary(true))))
    mount(<InterviewScreen taxYear={YEAR} onDone={() => {}} />)
    await screen.findByText('Mehrfachjobs? Nimm die Hauptquelle — der Rest kommt später.')
    fireEvent.click(screen.getByText('Beides'))
    await screen.findByText('Wer in Deutschland wohnt und in der Schweiz arbeitet, hat eigene Regeln — die gehen wir komplett mit dir durch.')
    expect(screen.queryByText('Angestellten-Teil vorbereiten — Abgabe erst mit Gewerbe')).toBeNull()
  })

  it('still stops at the gate when the switch is off', async () => {
    server.use(http.get(`*/v1/steuerjahre/${YEAR}/cockpit`, () => HttpResponse.json(summary(false))))
    mount(<InterviewScreen taxYear={YEAR} onDone={() => {}} />)
    await screen.findByText('Mehrfachjobs? Nimm die Hauptquelle — der Rest kommt später.')
    fireEvent.click(screen.getByText('Selbstständig'))
    await screen.findByText('Ehrlich: dafür sind wir noch nicht gut genug.')
  })
})

describe('the self-employment tile', () => {
  const facts = (extra: Partial<TileFacts>): TileFacts => ({ path: 'angestellte', answers: { job: 'Selbstständig' }, ...extra })

  it('exists only with the switch on and a declared self-employment', () => {
    expect(partitionTiles(facts({})).main.map((t) => t.id)).not.toContain('selbststaendig')
    expect(partitionTiles(facts({ selfEmployment: true })).main.map((t) => t.id)).toContain('selbststaendig')
    expect(TILES.some((t) => t.id === 'selbststaendig')).toBe(true)
  })

  it('is done once the kind is confirmed and a book exists', () => {
    const tile = tileById('selbststaendig')
    expect(tile.status(facts({ selfEmployment: true }))).toBe('offen')
    expect(tile.status(facts({ selfEmployment: true, business: { ...BASE_PROFILE, confirmedKind: 'gewerbe', bookExists: true } }))).toBe('erledigt')
  })

  it('shows on the cockpit with the switch on, and not with it off', async () => {
    const render1 = (on: boolean) => {
      server.use(
        http.get(`*/v1/steuerjahre/${YEAR}/cockpit`, () => HttpResponse.json(summary(on))),
        http.get(`*/v1/steuerjahre/${YEAR}/interview`, () => HttpResponse.json({ answers: { job: 'Selbstständig', ausland: 'Nein', kinder: 'Nein', familienstand: 'Ledig' }, nextStep: { kind: 'done' }, openItems: 0 })),
        http.get(`*/v1/steuerjahre/${YEAR}/selbststaendig`, () => HttpResponse.json(BASE_PROFILE)),
      )
      return mount(<CockpitScreen taxYear={YEAR} isSignedIn onOpenInterview={() => {}} />)
    }
    const on = render1(true)
    expect(await screen.findByTestId('cockpit-kachel-selbststaendig')).toBeTruthy()
    on.unmount()
    render1(false)
    await screen.findByTestId('cockpit-weiter').catch(() => null)
    expect(screen.queryByTestId('cockpit-kachel-selbststaendig')).toBeNull()
  })
})

describe('the self-employment switch in the Strom', () => {
  const basis = (selfEmployment: boolean) =>
    mount(
      <StromOptionsContext.Provider value={{ selfEmployment }}>
        <BasisPage taxYear={YEAR} stored={{ job: 'Selbstständig' }} onSaved={() => {}} />
      </StromOptionsContext.Provider>,
    )

  it('shows the Gewerbe notice on the basis page only while the switch is off', async () => {
    const off = basis(false)
    expect(await screen.findByTestId('strom-hinweis-gewerbe')).toBeTruthy()
    off.unmount()
    basis(true)
    await screen.findByTestId('strom-weiter')
    expect(screen.queryByTestId('strom-hinweis-gewerbe')).toBeNull()
  })
})
