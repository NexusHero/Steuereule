// ADR-0101 §22: the sale of the business and the Thesaurierung are saved with the business and shown computed.
import { describe, it, expect } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../test-msw-server'
import { BASE_URL, renderBusiness, useBusinessDefaults } from './businessTestKit'

describe('Betriebsaufgabe & Thesaurierung', () => {
  it('saves the sale with the allowance and the method, and shows the taxable gain', async () => {
    useBusinessDefaults()
    const puts: unknown[] = []
    server.use(
      http.get(`${BASE_URL}/sondertarife`, () => HttpResponse.json({ disposal: { gainEur: 100_000, allowanceEur: 45_000, taxableGainEur: 55_000, method: 'fuenftel' }, retained: null, retainedOnlyBilanz: false })),
      http.put(BASE_URL, async ({ request }) => {
        puts.push(await request.json())
        return HttpResponse.json({})
      }),
    )
    renderBusiness('sondertarife')
    fireEvent.change(await screen.findByTestId('sonder-date'), { target: { value: '2025-09-30' } })
    fireEvent.change(screen.getByTestId('sonder-priceEur'), { target: { value: '200000' } })
    fireEvent.change(screen.getByTestId('sonder-costsEur'), { target: { value: '5000' } })
    fireEvent.change(screen.getByTestId('sonder-capitalAccountEur'), { target: { value: '95000' } })
    fireEvent.click(screen.getByTestId('sonder-freibetrag'))
    fireEvent.click(screen.getByTestId('sonder-aufgabe-speichern'))
    await waitFor(() =>
      expect(puts).toContainEqual({ disposalFacts: { kind: 'veraeusserung', date: '2025-09-30', priceEur: 200_000, costsEur: 5_000, capitalAccountEur: 95_000, allowance: true, method: 'fuenftel' } }),
    )
    expect((await screen.findByTestId('sonder-steuerpflichtig')).textContent?.replace(/\s/g, ' ')).toBe('55.000,00 €')
  })

  it('says the Thesaurierung needs a Bilanz', async () => {
    useBusinessDefaults()
    server.use(http.get(`${BASE_URL}/sondertarife`, () => HttpResponse.json({ disposal: null, retained: null, retainedOnlyBilanz: true })))
    renderBusiness('sondertarife')
    expect(await screen.findByTestId('sonder-nur-bilanz')).toBeTruthy()
  })
})
