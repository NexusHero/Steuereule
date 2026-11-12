// #488: a link from the owl ("Maske ansehen") opens the page at the question the draft is about,
// not at the last step of the page.
import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import type { EntryStepId } from '@steuereule/core'
import { renderInApp } from '../../test-render'
import { server } from '../../test-msw-server'
import { CatalogScreen, type CatalogScreenEntry } from './CatalogScreen'

const TAX_YEAR = 2025
/** Everything of the page "Sonderausgaben" answered, as a finished return has it. */
const ANSWERED = { spenden: 'Ja', 'spenden-betrag': '300', 'kv-pv': 'Nein', riester: 'Nein' }

function renderCatalog(entry: CatalogScreenEntry, focusStep?: EntryStepId, answers: Record<string, string> = ANSWERED) {
  server.use(
    http.get(`*/v1/steuerjahre/${TAX_YEAR}/interview`, () => HttpResponse.json({ answers, nextStep: { kind: 'done' }, openItems: 0 }, { status: 200 })),
    http.get(`*/v1/steuerjahre/${TAX_YEAR - 1}/interview`, () => HttpResponse.json({ answers: {}, nextStep: { kind: 'done' }, openItems: 0 }, { status: 200 })),
  )
  return renderInApp(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <CatalogScreen entry={entry} focusStep={focusStep} taxYear={TAX_YEAR} revisit />
    </QueryClientProvider>,
  )
}

describe('CatalogScreen opened at a step (#488)', () => {
  it('without a step it still opens at the last one, as before', async () => {
    renderCatalog('sonderausgaben')
    expect(await screen.findByTestId('katalog-option-riester-Ja')).toBeTruthy()
  })

  it('opens at the step the draft is about', async () => {
    renderCatalog('sonderausgaben', 'spenden')
    expect(await screen.findByTestId('katalog-option-spenden-Ja')).toBeTruthy()
    expect(screen.queryByTestId('katalog-option-riester-Ja')).toBeNull()
  })

  it('opens another step of the same page', async () => {
    renderCatalog('sonderausgaben', 'kv-pv')
    expect(await screen.findByTestId('katalog-option-kv-pv-Ja')).toBeTruthy()
  })

  it('opens a page that is not the donations page at all', async () => {
    renderCatalog('lebenslagen', 'umzug', { dhf: 'Nein', umzug: 'Nein', abfindung: 'Nein', lohnersatz: 'Nein', nebenjob: 'Nein' })
    expect(await screen.findByTestId('katalog-option-umzug-Ja')).toBeTruthy()
    expect(screen.queryByTestId('katalog-option-spenden-Ja')).toBeNull()
  })
})
