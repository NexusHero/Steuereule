// What the confirmation screen shows for each kind of value and source, and how it behaves when
// loading or saving fails: errors are said, never swallowed.
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import type { ConfirmationResponseDto } from '@steuereule/api-client'
import { createAppI18n } from '../../i18n/app-i18n'
import { server } from '../../test-msw-server'
import { ConfirmationScreen } from './ConfirmationScreen'

const URL_OVERVIEW = '*/v1/steuerjahre/2025/bestaetigung'

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const onBack = vi.fn()
  const onOpenScreen = vi.fn()
  render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <ConfirmationScreen year={2025} onBack={onBack} onOpenScreen={onOpenScreen} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
  return { onBack, onOpenScreen }
}

const value = (over: object) => ({ key: 'k', screen: 'lstb', instance: null, field: 'lohnsteuer', value: '1', provenance: { kind: 'nutzer' }, confirmed: false, proposal: null, ...over })
const serve = (data: ConfirmationResponseDto) => server.use(http.get(URL_OVERVIEW, () => HttpResponse.json(data)))

describe('ConfirmationScreen loading', () => {
  it('shows a loading state, then an honest error that reloads on retry', async () => {
    let healthy = false
    server.use(http.get(URL_OVERVIEW, () => (healthy ? HttpResponse.json({ annexes: [] }) : HttpResponse.json(null, { status: 500 }))))
    renderScreen()
    expect(screen.getByLabelText('Wird geladen …')).toBeTruthy()

    expect(await screen.findByText('Die Werte zum Prüfen konnten nicht geladen werden.')).toBeTruthy()
    healthy = true
    fireEvent.click(screen.getByText('Noch mal versuchen'))
    expect(await screen.findByText('Alles bestätigt. Es gibt nichts mehr zu prüfen.')).toBeTruthy()
  })

  it('goes back from the app bar', async () => {
    serve({ annexes: [] })
    const { onBack } = renderScreen()
    fireEvent.click(await screen.findByTestId('bestaetigung-zurueck'))
    expect(onBack).toHaveBeenCalledOnce()
  })
})

describe('ConfirmationScreen values', () => {
  it('words the pension values: the Rentenart by name, years without a currency, unreadable and empty as such', async () => {
    serve({
      annexes: [
        {
          annex: 'anlageR',
          unconfirmed: 0,
          values: [
            value({ key: 'a', screen: 'rente', field: 'rentenart', value: 'GesetzlicheRente' }),
            value({ key: 'b', screen: 'rente', field: 'rentenbeginnJahr', value: '2019' }),
            value({ key: 'c', screen: 'rente', field: 'jahresbetrag', value: 'unklar' }),
            value({ key: 'd', screen: 'rente', field: 'alterBeiRentenbeginn', value: null }),
            value({ key: 'e', screen: 'rente', field: 'jahresbetrag', value: 'abc' }),
          ],
        },
      ],
    } as ConfirmationResponseDto)
    renderScreen()

    expect(await screen.findByText('Anlage R')).toBeTruthy()
    expect(screen.getByText('Alles bestätigt – nur Vorschläge offen')).toBeTruthy()
    expect(screen.getByText('Rentenart')).toBeTruthy()
    expect(screen.getByText('Gesetzliche Rente')).toBeTruthy()
    expect(screen.getByText('2019')).toBeTruthy()
    expect(screen.getByText('unlesbar')).toBeTruthy()
    expect(screen.getByText('leer')).toBeTruthy()
    expect(screen.getByText('abc')).toBeTruthy()
  })

  it('names capital and letting fields, and shows any other screen’s field by its own name', async () => {
    serve({
      annexes: [
        {
          annex: 'anlageKap',
          unconfirmed: 2,
          values: [
            value({ key: 'a', screen: 'kapital', field: 'kapitalertraege', value: '1200' }),
            value({ key: 'b', screen: 'vermietung', field: 'mieteinnahmen', value: '9000' }),
            value({ key: 'c', screen: 'kind', field: 'firstName', value: 'Lio' }),
          ],
        },
      ],
    } as ConfirmationResponseDto)
    renderScreen()

    expect(await screen.findByText(/Kapitalerträge vor Abzug des Sparer-Pauschbetrags/)).toBeTruthy()
    expect(screen.getByText('1.200 €')).toBeTruthy()
    expect(screen.getByText('firstName')).toBeTruthy()
    expect(screen.getByText('2 Werte unbestätigt')).toBeTruthy()
  })

  it('says where a value comes from: a receipt, an assistant reading a receipt', async () => {
    serve({
      annexes: [
        {
          annex: 'anlageN',
          unconfirmed: 1,
          values: [
            value({ key: 'a', provenance: { kind: 'beleg' } }),
            value({ key: 'b', provenance: { kind: 'assistent', name: 'Claude', receiptId: 'r1' } }),
          ],
        },
      ],
    } as ConfirmationResponseDto)
    renderScreen()
    expect(await screen.findByText('Aus Beleg')).toBeTruthy()
    expect(screen.getByText('Assistent: Claude, aus Beleg')).toBeTruthy()
  })

  it('offers no way to change an Anlage that holds no values', async () => {
    serve({ annexes: [{ annex: 'anlageV', unconfirmed: 0, values: [] }] } as ConfirmationResponseDto)
    renderScreen()
    await screen.findByText('Anlage V')
    expect(screen.queryByTestId('aendern-anlageV')).toBeNull()
    expect(screen.queryByTestId('bestaetige-anlageV')).toBeNull()
  })
})

describe('ConfirmationScreen failing saves', () => {
  const OPEN: ConfirmationResponseDto = { annexes: [{ annex: 'anlageN', unconfirmed: 1, values: [value({})] }] } as ConfirmationResponseDto

  it('says so when the server refuses to confirm, and clears the message on the next try', async () => {
    let ok = false
    server.use(
      http.get(URL_OVERVIEW, () => HttpResponse.json(OPEN)),
      http.put(`${URL_OVERVIEW}/anlagen/anlageN`, () => (ok ? HttpResponse.json(OPEN) : HttpResponse.json({}, { status: 500 }))),
    )
    renderScreen()
    fireEvent.click(await screen.findByTestId('bestaetige-anlageN'))
    expect(await screen.findByText('Das hat nicht geklappt. Versuch es noch mal.')).toBeTruthy()

    ok = true
    fireEvent.click(screen.getByTestId('bestaetige-anlageN'))
    await waitFor(() => expect(screen.queryByText('Das hat nicht geklappt. Versuch es noch mal.')).toBeNull())
  })

  it('says so when the network fails while confirming', async () => {
    server.use(
      http.get(URL_OVERVIEW, () => HttpResponse.json(OPEN)),
      http.put(`${URL_OVERVIEW}/anlagen/anlageN`, () => HttpResponse.error()),
    )
    renderScreen()
    fireEvent.click(await screen.findByTestId('bestaetige-anlageN'))
    expect(await screen.findByText('Das hat nicht geklappt. Versuch es noch mal.')).toBeTruthy()
  })
})
