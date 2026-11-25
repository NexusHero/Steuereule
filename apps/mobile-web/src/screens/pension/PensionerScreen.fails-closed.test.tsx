// The Rente mask after WEB-28: a failed load writes nothing; typing after „Kann ich nicht lesen“ shows and saves
// the typed amount (WEB-13, UnclearableNumberField); an amount typed with thousands is read as such (WEB-46).
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import type { PensionResponseDto } from '@steuereule/api-client'
import { createAppI18n } from '../../i18n/app-i18n'
import { server } from '../../test-msw-server'
import { expectFailsClosed, failEveryRequest } from '../../test-every-query-fails'
import { PensionerScreen } from './PensionerScreen'

const UNCLEAR: PensionResponseDto = {
  kind: 'GesetzlicheRente',
  jahresbetrag: { kind: 'unklar' },
  rentenbeginnJahr: { kind: 'offen' },
  alterBeiRentenbeginn: { kind: 'offen' },
  items: [],
  status: { kind: 'bestimmt', einnahmen: 0, vorsorgeaufwand: 0, anrechnung: 0 },
} as PensionResponseDto

function renderPension(partnerName?: string) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <PensionerScreen taxYear={2026} {...(partnerName ? { partnerName } : {})} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

describe('Rente fails closed', () => {
  it('shows the load failure and writes nothing', async () => {
    const failing = failEveryRequest()
    renderPension()
    await expectFailsClosed(failing)
  })

  it('the same for the partner’s pension', async () => {
    const failing = failEveryRequest()
    renderPension('Büsra')
    await expectFailsClosed(failing)
  })
})

describe('typing after „Kann ich nicht lesen“ (WEB-13)', () => {
  it('shows the typed amount and saves it, thousands included', async () => {
    const bodies: unknown[] = []
    server.use(
      http.get('*/v1/steuerjahre/2026/rente', () => HttpResponse.json(UNCLEAR)),
      http.put('*/v1/steuerjahre/2026/rente/jahresbetrag', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(UNCLEAR)
      }),
    )
    renderPension()
    const amount = (await screen.findByLabelText(/Jahresbetrag/)) as HTMLInputElement
    expect(amount.value).toBe('')
    fireEvent.change(amount, { target: { value: '18.240' } })
    expect(amount.value).toBe('18.240')
    fireEvent.blur(amount)
    await waitFor(() => expect(bodies).toEqual([{ kind: 'erfasst', value: 18240 }]))
  })
})
