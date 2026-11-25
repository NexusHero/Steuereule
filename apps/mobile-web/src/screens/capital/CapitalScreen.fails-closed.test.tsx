// The Kapital mask after WEB-28: a failed load writes nothing; a failed link load says why the owner question is
// missing instead of filing the depot under Person A silently (NM-15).
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import type { KapitalResponseDto } from '@steuereule/api-client'
import { createAppI18n } from '../../i18n/app-i18n'
import { server } from '../../test-msw-server'
import { expectFailsClosed, failEveryRequest } from '../../test-every-query-fails'
import { CapitalScreen } from './CapitalScreen'

const BASE: KapitalResponseDto = {
  kapitalertraege: { kind: 'offen' },
  sparerPauschbetrag: { kind: 'offen' },
  kapitalertragsteuer: { kind: 'offen' },
  solidaritaetszuschlag: { kind: 'offen' },
  kirchensteuer: { kind: 'offen' },
  requiredFields: ['kapitalertraege'],
  depot: { kind: 'deutscher-broker' },
  items: [],
  status: { kind: 'offen', einnahmen: 0, vorsorgeaufwand: 0, anrechnung: 0, openItems: 0, conflicts: 0 },
  inhaber: null,
} as KapitalResponseDto

function renderCapital() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <CapitalScreen taxYear={2026} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

describe('Kapital fails closed', () => {
  it('shows the load failure and writes nothing', async () => {
    const failing = failEveryRequest()
    renderCapital()
    await expectFailsClosed(failing)
  })

  it('says the owner question is missing when the link does not load (NM-15)', async () => {
    server.use(
      http.get('*/v1/steuerjahre/2026/kapital', () => HttpResponse.json(BASE)),
      http.get('*/v1/steuerjahre/2026/kopplung', () => HttpResponse.json({ message: 'x' }, { status: 500 })),
    )
    renderCapital()
    expect(await screen.findByTestId('kapital-inhaber-ladefehler')).toBeTruthy()
  })
})
