// The Cockpit hero beyond the plain range: an even result, a result that may go either way, the line that
// says what the last change did (and can be dismissed), and the year filed through Mein ELSTER.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { CockpitSummaryDto } from '@steuereule/api-client'
import { server } from '../../../test/test-msw-server'
import { CockpitScreen, type CockpitScreenProps } from './CockpitScreen'
import { rememberOpenedArea, resetEffectMemory } from './effectMemory'
import { makeTestQueryClient, renderWithQuery } from '../../../test/test-render'

const YEAR = 2026
const SUMMARY: CockpitSummaryDto = { taxYear: YEAR, status: { kind: 'spanne', from: 49880, to: 50120, openItems: 0, conflicts: 0 }, openItems: 0, submission: null }
const ESTIMATE_URL = `*/v1/steuerjahre/${YEAR}/steuerschaetzung`

const serve = (summary: CockpitSummaryDto = SUMMARY) =>
  server.use(
    http.get(`*/v1/steuerjahre/${YEAR}/cockpit`, () => HttpResponse.json(summary)),
    http.get(ESTIMATE_URL, () => HttpResponse.json({ kind: 'offen', missing: [] })),
  )
const estimate = (result: { from: number; to: number }) => server.use(http.get(ESTIMATE_URL, () => HttpResponse.json({ kind: 'spanne', result, churchTaxOpen: false })))

function renderCockpit(props: Partial<CockpitScreenProps> = {}) {
  const queryClient = makeTestQueryClient()
  const view = renderWithQuery(<CockpitScreen taxYear={YEAR} onOpenInterview={() => {}} {...props} />, { client: queryClient })
  return { ...view, queryClient }
}

beforeEach(() => resetEffectMemory())
afterEach(() => resetEffectMemory())

describe('the hero result', () => {
  it('says "ausgeglichen" for exactly 0 €, neither refund nor back payment', async () => {
    serve()
    estimate({ from: 0, to: 0 })
    renderCockpit()
    expect(await screen.findByText('Voraussichtliches Ergebnis')).toBeTruthy()
    expect(screen.getByTestId('cockpit-ausgeglichen')).toBeTruthy()
  })

  it('gives both sides when the result may go either way', async () => {
    serve()
    estimate({ from: -150, to: 300 })
    renderCockpit()
    expect(await screen.findByText('Voraussichtliches Ergebnis')).toBeTruthy()
    expect(screen.getByTestId('cockpit-erstattung-betrag').textContent).toMatch(/150.*300/)
  })

  it('leads a range with its approximate middle and shows the range right under it', async () => {
    serve()
    estimate({ from: 856, to: 986 })
    renderCockpit()
    await screen.findByText('Voraussichtliche Erstattung')
    expect(screen.getByTestId('cockpit-erstattung-mitte').textContent).toMatch(/^ca\. 921\s*€$/)
    expect(screen.getByTestId('cockpit-erstattung-betrag').textContent).toMatch(/^856\s*–\s*986\s*€$/)
    expect(screen.getByTestId('cockpit-erstattung').textContent).toMatch(/Voraussichtliche Erstattung.*ca\. 921.*856.*986/)
  })

  it('leads a back-payment range with its middle as a plain amount', async () => {
    serve()
    estimate({ from: -300, to: -100 })
    renderCockpit()
    await screen.findByText('Voraussichtliche Nachzahlung')
    expect(screen.getByTestId('cockpit-erstattung-mitte').textContent).toMatch(/^ca\. 200\s*€$/)
    expect(screen.getByTestId('cockpit-erstattung-betrag').textContent).toMatch(/^100\s*–\s*300\s*€$/)
  })

  it('names no middle when the result may go either way, nor for a point result', async () => {
    serve()
    estimate({ from: -150, to: 300 })
    renderCockpit()
    await screen.findByText('Voraussichtliches Ergebnis')
    expect(screen.queryByTestId('cockpit-erstattung-mitte')).toBeNull()
  })

  it('shows one figure for a point result', async () => {
    serve()
    estimate({ from: 500, to: 500 })
    renderCockpit()
    await screen.findByText('Voraussichtliche Erstattung')
    expect(screen.getByTestId('cockpit-erstattung-betrag').textContent).toMatch(/^500\s*€$/)
    expect(screen.queryByTestId('cockpit-erstattung-mitte')).toBeNull()
  })
})

describe('what the last change did', () => {
  it('names the area the user came from and what it did to the refund, and can be dismissed', async () => {
    serve()
    estimate({ from: 400, to: 500 })
    rememberOpenedArea(YEAR, 'einkuenfte' as never)
    const { queryClient } = renderCockpit()
    await screen.findByText('Voraussichtliche Erstattung')
    expect(screen.queryByTestId('cockpit-wirkung')).toBeNull()

    estimate({ from: 600, to: 700 })
    await queryClient.invalidateQueries()

    const line = await screen.findByTestId('cockpit-wirkung')
    expect(line.textContent).toContain('+200')
    expect(line.textContent).toContain('zu deinen Gunsten')
    fireEvent.click(line)
    await waitFor(() => expect(screen.queryByTestId('cockpit-wirkung')).toBeNull())
  })

  it('says it came from a loss, without an area when none was opened', async () => {
    serve()
    estimate({ from: 600, to: 700 })
    const { queryClient } = renderCockpit()
    await screen.findByText('Voraussichtliche Erstattung')

    estimate({ from: 100, to: 200 })
    await queryClient.invalidateQueries()

    const line = await screen.findByTestId('cockpit-wirkung')
    expect(line.textContent).toContain('Deine letzte Änderung:')
    expect(line.textContent).toContain('zu deinen Lasten')
  })
})

describe('the year filed through Mein ELSTER', () => {
  it('says so in one line', async () => {
    serve({ ...SUMMARY, filingPath: 'elster-ausfuellhilfe' } as CockpitSummaryDto)
    renderCockpit({ onOpenElsterHelp: vi.fn() })
    expect((await screen.findByTestId('cockpit-elster-hinweis')).textContent).toMatch(/ELSTER/)
  })

  it('shows no ELSTER hint for a year filed on paper', async () => {
    serve()
    renderCockpit({ onOpenElsterHelp: vi.fn() })
    await screen.findByText('Erfasstes Einkommen')
    expect(screen.queryByTestId('cockpit-elster-hinweis')).toBeNull()
  })
})
