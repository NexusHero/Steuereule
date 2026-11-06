// REQ-022 (ticket 10.2) — Veranlagungsartenvergleich screen: `aussage`/`kind` FIRST (ADR-0034 —
// `empfehlung` only ever on `eindeutig`), two numbers each with a Herkunfts-Chip, and honest
// "zu knapp"/"können wir noch nicht" / gate states. Exercises the real generated
// `useFilingTypeComparisonControllerGetComparison` hook against the endpoint, with MSW
// mocking the wire shape (the same pattern as CockpitScreen.test.tsx).
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { createAppI18n } from '../../i18n/app-i18n'
import { FilingTypeComparisonScreen } from './VeranlagungsartenvergleichScreen'
import { server } from '../../test-msw-server'
import type { FilingTypeComparisonDto } from '@steuereule/api-client'

const TAX_YEAR = 2026
const COMPARISON_URL = `*/v1/steuerjahre/${TAX_YEAR}/veranlagungsartenvergleich`

const UNAMBIGUOUS: FilingTypeComparisonDto = {
  kind: 'eindeutig',
  recommendation: 'zusammen',
  single: 32115,
  joint: 21096,
  delta: -11019,
  uncertainty: { kind: 'bestimmt', upperLimit: 0 },
  provenance: { zveA: 100000, zveB: 0, components: ['einkommensteuer', 'solidaritaetszuschlag'] },
}

const TOO_TIGHT: FilingTypeComparisonDto = {
  kind: 'zu-knapp',
  single: 21442,
  joint: 21096,
  delta: -346,
  uncertainty: { kind: 'bestimmt', upperLimit: 450 },
  provenance: { zveA: 60000, zveB: 40000, components: ['einkommensteuer', 'solidaritaetszuschlag'] },
}

const UNDETERMINED: FilingTypeComparisonDto = {
  kind: 'unbestimmt',
  single: 32115,
  joint: 21096,
  delta: -11019,
  uncertainty: { kind: 'unbestimmt', reason: 'progressionsvorbehalt-nicht-eingegeben' },
  provenance: { zveA: 100000, zveB: 0, components: ['einkommensteuer', 'solidaritaetszuschlag'] },
}

function mockComparison(data: FilingTypeComparisonDto | null) {
  server.use(http.get(COMPARISON_URL, () => HttpResponse.json(data, { status: 200 })))
}

function renderScreen(onDone?: () => void) {
  const i18n = createAppI18n('de')
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider mode="light">
          <FilingTypeComparisonScreen taxYear={TAX_YEAR} {...(onDone ? { onDone } : {})} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

/** Choose "Ja" (married) and type the partner income — the two M1 inputs that enable the query. */
async function chooseMarried(zveB: string) {
  fireEvent.click(screen.getByTestId('verheiratet-ja'))
  fireEvent.change(screen.getByTestId('zveb-input'), { target: { value: zveB } })
}

describe('VeranlagungsartenvergleichScreen', () => {
  it('lets a single person carry on to the cockpit instead of offering only a way back', () => {
    let done = 0
    renderScreen(() => (done += 1))
    fireEvent.click(screen.getByTestId('verheiratet-nein'))
    fireEvent.click(screen.getByText('Weiter zum Cockpit'))
    expect(done).toBe(1)
  })

  it('renders `aussage` first: `eindeutig` shows the recommendation, then the two numbers', async () => {
    mockComparison(UNAMBIGUOUS)
    renderScreen()
    await chooseMarried('0')

    expect(await screen.findByText('Zusammenveranlagung ist günstiger.')).toBeTruthy()
    expect(screen.getByText('32.115 €')).toBeTruthy()
    expect(screen.getByText('21.096 €')).toBeTruthy()
  })

  it('renders `eindeutig` in the other direction (Einzelveranlagung) honestly', async () => {
    mockComparison({ ...UNAMBIGUOUS, recommendation: 'einzel' })
    renderScreen()
    await chooseMarried('0')

    expect(await screen.findByText('Einzelveranlagung ist günstiger.')).toBeTruthy()
  })

  it('renders `zu-knapp` honestly — "zu knapp, um das zu sagen", no verdict', async () => {
    mockComparison(TOO_TIGHT)
    renderScreen()
    await chooseMarried('40000')

    expect(await screen.findByText('Zu knapp, um das zu sagen.')).toBeTruthy()
    // No recommendation is rendered (the verdict is unearned — ADR-0034).
    expect(screen.queryByText(/günstiger/)).toBeNull()
  })

  it('renders `unbestimmt` honestly — "das können wir noch nicht", plus the Progressionsvorbehalt note', async () => {
    mockComparison(UNDETERMINED)
    renderScreen()
    await chooseMarried('0')

    expect(await screen.findByText('Das können wir noch nicht sagen.')).toBeTruthy()
    expect(screen.getByText('Ehrlich: der Progressionsvorbehalt (Lohnersatz) ist hier noch nicht berücksichtigt.')).toBeTruthy()
  })

  it('reveals provenance (Herkunfts-Chips) on both numbers, consistent with the zvE-Basen', async () => {
    mockComparison(UNAMBIGUOUS)
    renderScreen()
    await chooseMarried('0')
    await screen.findByText('Zusammenveranlagung ist günstiger.')

    const chips = screen.getAllByText('Herkunft')
    expect(chips).toHaveLength(2)
    fireEvent.click(chips[0]!)
    expect(screen.getByText('§32a EStG Grundtarif + Soli §4 SolZG')).toBeTruthy()
    expect(screen.getByText('zvE-Basis: 100000 + 0 (Einnahmen — noch kein echtes zvE)')).toBeTruthy()
  })

  it('shows the honest "nur Verheiratete" gate while the married flag is off (no request yet)', async () => {
    mockComparison(UNAMBIGUOUS)
    renderScreen()

    expect(screen.getByText('Nur Verheiratete können zwischen Einzel- und Zusammenveranlagung wählen.')).toBeTruthy()
    expect(screen.queryByTestId('aussage')).toBeNull()
  })
})
