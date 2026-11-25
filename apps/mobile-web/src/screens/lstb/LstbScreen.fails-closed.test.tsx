// The LStB mask after WEB-28: a failed load writes nothing; a failed save is visible at once with its reason
// (WEB-12); an amount the app cannot read is named, not dropped (WEB-12); typing after „Kann ich nicht lesen“
// shows what is typed and saves it (WEB-13).
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import type { LstbResponseDto } from '@steuereule/api-client'
import { createAppI18n } from '../../i18n/app-i18n'
import { EMPTY_LSTB_RESPONSE, server } from '../../test-msw-server'
import { expectFailsClosed, failEveryRequest } from '../../test-every-query-fails'
import { LstbScreen } from './LstbScreen'

function renderLstb(partnerName?: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <LstbScreen taxYear={2026} {...(partnerName ? { partnerName } : {})} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

function recordFieldPuts(status = 200) {
  const puts: { field: string; body: unknown }[] = []
  server.use(
    http.put('*/v1/steuerjahre/2026/lstb/:feld', async ({ params, request }) => {
      puts.push({ field: String(params.feld), body: await request.json() })
      return status === 200 ? HttpResponse.json(EMPTY_LSTB_RESPONSE) : HttpResponse.json({ message: 'x' }, { status })
    }),
  )
  return puts
}

describe('LStB fails closed', () => {
  it('shows the load failure and writes nothing', async () => {
    const failing = failEveryRequest()
    renderLstb()
    await expectFailsClosed(failing)
  })

  it('the same for the partner’s certificate', async () => {
    const failing = failEveryRequest()
    renderLstb('Büsra')
    await expectFailsClosed(failing)
  })

  it('a section that does not load says so, with a retry, instead of an empty field', async () => {
    server.use(http.get('*/v1/steuerjahre/2026/lstb-kirchensteuer', () => HttpResponse.json({ message: 'x' }, { status: 500 })))
    renderLstb()
    const failure = await screen.findByTestId('lstb-kirchensteuer-ladefehler')
    expect(within(failure).getByText(/Die Kirchensteuer konnte nicht geladen werden/)).toBeTruthy()
    expect(screen.queryByTestId('lstb-kirchensteuer')).toBeNull()
  })
})

describe('LStB saves', () => {
  it('a failed save is shown at once with its reason, before Weiter (WEB-12)', async () => {
    recordFieldPuts(500)
    renderLstb()
    const gross = await screen.findByTestId('lstb-bruttoarbeitslohn')
    fireEvent.change(gross, { target: { value: '40000' } })
    fireEvent.blur(gross)
    const notice = await screen.findByTestId('speichern-fehlgeschlagen')
    expect(notice.textContent).toContain('Bei uns ist gerade etwas schiefgelaufen')
    expect((gross as HTMLInputElement).value).toBe('40000')
  })

  it('names an amount it cannot read and sends nothing (WEB-12)', async () => {
    const puts = recordFieldPuts()
    renderLstb()
    const gross = await screen.findByTestId('lstb-bruttoarbeitslohn')
    fireEvent.change(gross, { target: { value: '40.000,5x' } })
    fireEvent.blur(gross)
    expect(await screen.findByText(/Das ist kein Betrag/)).toBeTruthy()
    expect(puts).toEqual([])
    fireEvent.change(gross, { target: { value: '40.000' } })
    fireEvent.blur(gross)
    await waitFor(() => expect(puts).toEqual([{ field: 'bruttoarbeitslohn', body: { kind: 'erfasst', value: 40000 } }]))
  })

  it('shows and saves what is typed after „Kann ich nicht lesen“ (WEB-13)', async () => {
    const unclear: LstbResponseDto = { ...EMPTY_LSTB_RESPONSE, lohnsteuer: { kind: 'unklar' } } as LstbResponseDto
    server.use(http.get('*/v1/steuerjahre/2026/lstb', () => HttpResponse.json(unclear)))
    const puts = recordFieldPuts()
    renderLstb()
    const tax = (await screen.findByTestId('lstb-lohnsteuer')) as HTMLInputElement
    fireEvent.change(tax, { target: { value: '5123' } })
    expect(tax.value).toBe('5123')
    fireEvent.blur(tax)
    await waitFor(() => expect(puts).toEqual([{ field: 'lohnsteuer', body: { kind: 'erfasst', value: 5123 } }]))
  })
})
