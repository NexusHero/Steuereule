// WEB-46 / NC-07: the partner income is read the German way; NC-08: no failure beside „Lädt“; C-30: a
// failed master-data read preselects nothing; WEB-28: with every request failing the screen says so.
import { describe, it, expect } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { http, HttpResponse, delay } from 'msw'
import { server } from '../../test-msw-server'
import { expectFailsClosed, failEveryRequest } from '../../test-every-query-fails'
import { FilingTypeComparisonScreen } from './FilingTypeComparisonScreen'
import { renderWithQuery } from '../../test-render'

const URL_COMPARISON = '*/v1/steuerjahre/2026/veranlagungsartenvergleich'
const VERDICT = { kind: 'eindeutig', recommendation: 'zusammen', single: 10, joint: 5, delta: 5, uncertainty: { kind: 'bestimmt', upperLimit: 0 }, provenance: { zveA: 1, zveB: 2, components: [] } }

function renderScreen() {
  return renderWithQuery(<FilingTypeComparisonScreen taxYear={2026} />)
}

describe('the partner income is read the German way (WEB-46, NC-07)', () => {
  it('sends „40.000“ as forty thousand and „40.000,50“ as forty thousand and fifty cents', async () => {
    const asked: string[] = []
    server.use(
      http.get(URL_COMPARISON, ({ request }) => {
        asked.push(new URL(request.url).searchParams.get('zveB') ?? '')
        return HttpResponse.json(VERDICT)
      }),
    )
    renderScreen()
    fireEvent.click(screen.getByTestId('verheiratet-ja'))
    fireEvent.change(screen.getByTestId('zveb-input'), { target: { value: '40.000' } })
    await waitFor(() => expect(asked).toContain('40000'))
    fireEvent.change(screen.getByTestId('zveb-input'), { target: { value: '40.000,50' } })
    await waitFor(() => expect(asked).toContain('40000.5'))
  })

  it('says what is no amount instead of ignoring it', () => {
    renderScreen()
    fireEvent.click(screen.getByTestId('verheiratet-ja'))
    fireEvent.change(screen.getByTestId('zveb-input'), { target: { value: '1.2.3' } })
    expect(screen.getByTestId('zveb-ungueltig')).toBeTruthy()
  })
})

describe('the states of the comparison', () => {
  it('shows „Lädt“ alone while it calculates, never the failure beside it (NC-08)', async () => {
    server.use(http.get(URL_COMPARISON, async () => delay('infinite')))
    renderScreen()
    fireEvent.click(screen.getByTestId('verheiratet-ja'))
    fireEvent.change(screen.getByTestId('zveb-input'), { target: { value: '5' } })
    expect(await screen.findByLabelText('Dein Vergleich wird berechnet …')).toBeTruthy()
    expect(screen.queryByText('Das hat nicht geklappt.')).toBeNull()
  })

  it('preselects nothing when the reads that know the marital status failed (C-30)', async () => {
    const fail = () => HttpResponse.json({ statusCode: 500 }, { status: 500 })
    server.use(http.get('*/v1/stammdaten', fail), http.get('*/v1/steuerjahre/2026/interview', fail))
    renderScreen()
    expect(await screen.findByTestId('vergleich-familienstand-unbekannt')).toBeTruthy()
    expect(screen.queryByText('Nur Verheiratete können zwischen Einzel- und Zusammenveranlagung wählen.')).toBeNull()
  })

  it('fails closed with every request failing (WEB-28)', async () => {
    const failing = failEveryRequest()
    renderScreen()
    await expectFailsClosed(failing)
  })
})
