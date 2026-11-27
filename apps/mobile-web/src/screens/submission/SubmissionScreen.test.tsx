import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import type { QueryClient } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '../../../test/test-msw-server'
import { ShellStateProvider } from '../../navigation/ShellState'
import { SubmissionGateProvider } from '../../navigation/SubmissionGateContext'
import { SubmissionScreen } from './SubmissionScreen'
import type { TileId } from '../cockpit/tiles'
import { makeTestQueryClient, renderWithQuery } from '../../../test/test-render'

const TAX_YEAR = 2025
const RUNNING_YEAR = 2026

function mockCompleteLstb(year = TAX_YEAR) {
  server.use(
    http.get(`*/v1/steuerjahre/${year}/lstb`, () =>
      HttpResponse.json({
        bruttoarbeitslohn: { kind: 'erfasst', value: 50000 },
        lohnsteuer: { kind: 'erfasst', value: 8000 },
        sozialversicherung: { kind: 'erfasst', value: 9000 },
        state: { kind: 'vollstaendig', bruttoarbeitslohn: 50000, lohnsteuer: 8000, sozialversicherung: 9000 },
      }),
    ),
  )
}

function mockInterview(answers: Record<string, string>, year = TAX_YEAR) {
  server.use(
    http.get(`*/v1/steuerjahre/${year}/interview`, () =>
      HttpResponse.json({ answers, nextStep: { kind: 'done' }, openItems: 0 }),
    ),
  )
}

/** A married employee with a complete LStB whose coupling carries the given filing type. */
function mockCompleteMarriedCase(filingType: 'zusammen' | 'einzel') {
  mockCompleteLstb()
  mockInterview({ job: 'Angestellt', ausland: 'Nein', kinder: 'Nein', familienstand: 'Verheiratet' })
  server.use(
    http.get('*/v1/stammdaten', () => HttpResponse.json({ missing: [], familienstand: 'verheiratet' })),
    http.get(`*/v1/steuerjahre/${TAX_YEAR}/kopplung`, () =>
      HttpResponse.json({ filingType, personBUserId: null, invitationCode: null, personB: null }),
    ),
  )
}

function renderSubmission(
  props: {
    onBack?: () => void
    onOpenTile?: (target: TileId, revisit: boolean) => void
    onOpenPrintout?: (year: number) => void
    queryClient?: QueryClient
    taxYear?: number
  } = {},
) {
  const queryClient = props.queryClient ?? makeTestQueryClient()
  const onOpenTile = props.onOpenTile ?? vi.fn()
  const onOpenPrintout = props.onOpenPrintout ?? vi.fn()
  return {
    queryClient,
    onOpenTile,
    onOpenPrintout,
    ...renderWithQuery(
      <SubmissionGateProvider>
        <ShellStateProvider onRegister={() => {}} onLogin={() => {}} onSignedOut={() => {}}>
          <SubmissionScreen
            taxYear={props.taxYear ?? TAX_YEAR}
            {...(props.onBack ? { onBack: props.onBack } : {})}
            onOpenTile={onOpenTile}
            onOpenPrintout={onOpenPrintout}
          />
        </ShellStateProvider>
      </SubmissionGateProvider>,
      { client: queryClient },
    ),
  }
}

describe('SubmissionScreen (§ 3.4)', () => {
  it('never says everything is clear while the printout still lacks details', async () => {
    mockCompleteLstb()
    mockInterview({ job: 'Angestellt', ausland: 'Nein', kinder: 'Nein', familienstand: 'Ledig' })
    server.use(
      http.get('*/v1/steuerjahre/:jahr/ausdruck/pruefung', () =>
        HttpResponse.json({ missing: ['strasse', 'plz', 'iban'], missingChildFields: [], hints: [] }),
      ),
    )
    renderSubmission()

    expect(await screen.findByTestId('abgabe-ausdruck-offen')).toBeTruthy()
    expect(screen.getByTestId('abgabe-ausdruck-offen').textContent).toContain('3 Angaben')
    expect(screen.queryByText('Keine Widersprüche, nichts offen.')).toBeNull()
  })

  it('says everything is clear once nothing is missing for the printout', async () => {
    mockCompleteLstb()
    mockInterview({ job: 'Angestellt', ausland: 'Nein', kinder: 'Nein', familienstand: 'Ledig' })
    renderSubmission()

    expect(await screen.findByText('Keine Widersprüche, nichts offen.')).toBeTruthy()
    expect(screen.queryByTestId('abgabe-ausdruck-offen')).toBeNull()
  })

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
    mockCompleteMarriedCase('einzel')

    const onOpenPrintout = vi.fn()
    renderSubmission({ onOpenPrintout })

    const printBtn = await screen.findByTestId('abgabe-zum-ausdruck')
    expect((printBtn as HTMLButtonElement).disabled).toBe(false)
    expect(screen.queryByTestId('abgabe-vergleich-abschnitt')).toBeNull()
    expect(screen.queryByTestId('verheiratet-ja')).toBeNull()

    fireEvent.click(printBtn)
    expect(onOpenPrintout).toHaveBeenCalledWith(TAX_YEAR)
  })

  it('does not ask a recorded joint return whether the user is married, and does not hold the printout back (Echtdatenlauf 4)', async () => {
    mockCompleteMarriedCase('zusammen')

    const onOpenPrintout = vi.fn()
    renderSubmission({ onOpenPrintout })

    // The filing type is recorded: it is said, not asked again.
    expect((await screen.findByTestId('abgabe-veranlagungsart')).textContent).toContain('Zusammenveranlagung')
    expect(screen.queryByTestId('verheiratet-ja')).toBeNull()
    expect(screen.queryByTestId('zveb-input')).toBeNull()
    const printBtn = screen.getByTestId('abgabe-zum-ausdruck') as HTMLButtonElement
    expect(printBtn.disabled).toBe(false)
    fireEvent.click(printBtn)
    expect(onOpenPrintout).toHaveBeenCalledWith(TAX_YEAR)
  })

  it('offers the comparison with separate returns as an extra, without the married question', async () => {
    mockCompleteMarriedCase('zusammen')
    renderSubmission()

    fireEvent.click(await screen.findByTestId('abgabe-vergleich-oeffnen'))
    expect(screen.getByTestId('abgabe-vergleich-abschnitt')).toBeTruthy()
    expect(screen.getByTestId('zveb-input')).toBeTruthy()
    expect(screen.queryByTestId('verheiratet-ja')).toBeNull()
    expect(screen.queryByTestId('verheiratet-nein')).toBeNull()
    // Still an extra: the printout stays open while the comparison is.
    expect((screen.getByTestId('abgabe-zum-ausdruck') as HTMLButtonElement).disabled).toBe(false)
  })

  it('K2: says up front that the running year cannot be filed yet, and keeps the printout closed', async () => {
    mockCompleteLstb(RUNNING_YEAR)
    mockInterview({ job: 'Angestellt', ausland: 'Nein', kinder: 'Nein', familienstand: 'Ledig' }, RUNNING_YEAR)
    server.use(http.get('*/v1/stammdaten', () => HttpResponse.json({ missing: [], familienstand: 'ledig' })))

    renderSubmission({ taxYear: RUNNING_YEAR })

    expect(await screen.findByTestId('abgabe-laufendes-jahr')).toBeTruthy()
    expect(
      screen.getByText('2026 läuft noch. Sammle Belege und Homeoffice-Tage — abgeben kannst du ab Januar 2027.'),
    ).toBeTruthy()
    expect((screen.getByTestId('abgabe-zum-ausdruck') as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('SubmissionScreen — a read that decides the way fails visibly (NC-18)', () => {
  it('a failed master-data read is a failed page with a retry, not a couple without the comparison', async () => {
    mockCompleteMarriedCase('zusammen')
    let healthy = false
    server.use(http.get('*/v1/stammdaten', () => (healthy ? HttpResponse.json({ missing: [], familienstand: 'verheiratet' }) : HttpResponse.json({ statusCode: 500 }, { status: 500 }))))
    renderSubmission()
    expect(await screen.findByText('Bei uns ist gerade etwas schiefgelaufen. Versuch es gleich noch mal.')).toBeTruthy()
    expect(screen.queryByTestId('abgabe-zum-ausdruck')).toBeNull()
    healthy = true
    fireEvent.click(screen.getByTestId('fehler-erneut-versuchen'))
    expect(await screen.findByTestId('abgabe-veranlagungsart')).toBeTruthy()
  })
})
