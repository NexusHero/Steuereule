// ADR-0101 §22: the Voranmeldungen page shows each period's Kennzahlen and the ZM, and saves the facts.
import { describe, it, expect } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../../test/test-msw-server'
import { BASE_URL, renderBusiness, useBusinessDefaults } from './businessTestKit'

const OVERVIEW = {
  period: 'quartal',
  periodSource: 'vorjahressteuer',
  extension: false,
  specialPrepaymentEur: null,
  periods: [
    { label: 'Q1/2025', from: '2025-01-01', to: '2025-03-31', due: '2025-04-10', kennzahlen: { '81': 1000, '66': 19, '83': 171 }, vatDueEur: 171 },
    { label: 'Q2/2025', from: '2025-04-01', to: '2025-06-30', due: '2025-07-10', kennzahlen: { '83': -40 }, vatDueEur: -40 },
  ],
  totalEur: 131,
  ecSalesList: { period: 'quartal', reports: [{ label: 'Q2/2025', due: '2025-07-25', rows: [{ vatId: null, goodsEur: 5000, servicesEur: 0 }] }] },
}

describe('the Voranmeldungen', () => {
  it('lists the periods with their Kennzahlen, the due date and the ZM, and warns of a missing VAT id', async () => {
    useBusinessDefaults()
    server.use(http.get(`${BASE_URL}/umsatzsteuer/voranmeldungen`, () => HttpResponse.json(OVERVIEW)))
    renderBusiness('voranmeldungen')
    const q1 = await screen.findByTestId('va-Q1/2025')
    expect(q1.textContent).toContain('fällig 10.04.2025')
    expect(q1.textContent).toContain('Kz 81')
    expect(screen.getByTestId('va-Q2/2025-83').textContent?.replace(/\s/g, ' ')).toBe('40,00 €')
    expect(screen.getByText('Erstattung (Kz 83)')).toBeTruthy()
    expect(screen.getByTestId('va-zeitraum').textContent).toContain('Vierteljährlich')
    expect(screen.getByTestId('va-zm').textContent).toContain('ohne USt-IdNr.')
    expect(screen.getByText(/fehlt die USt-IdNr/)).toBeTruthy()
  })

  it('saves the Dauerfristverlängerung and a period the office set', async () => {
    useBusinessDefaults()
    const puts: unknown[] = []
    server.use(
      http.get(`${BASE_URL}/umsatzsteuer/voranmeldungen`, () => HttpResponse.json(OVERVIEW)),
      http.put(BASE_URL, async ({ request }) => {
        puts.push(await request.json())
        return HttpResponse.json({})
      }),
    )
    renderBusiness('voranmeldungen')
    fireEvent.click(await screen.findByTestId('va-dauerfrist'))
    await waitFor(() => expect(puts).toContainEqual({ vatPeriodFacts: { extension: true } }))
    fireEvent.click(screen.getByTestId('va-periode-monat'))
    await waitFor(() => expect(puts).toContainEqual({ vatPeriodFacts: { period: 'monat' } }))
  })
})
