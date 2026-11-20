// ADR-0101 §22: the company car page computes first and books only on „Buchen“.
import { describe, it, expect } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../test-msw-server'
import { BASE_URL, renderBusiness, useBusinessDefaults } from './businessTestKit'

describe('the company car', () => {
  it('computes the private use of an electric car and books it on request', async () => {
    useBusinessDefaults()
    const sent: unknown[] = []
    let booked = 0
    server.use(
      http.post(`${BASE_URL}/firmenwagen`, async ({ request }) => {
        sent.push(await request.json())
        return HttpResponse.json({ kind: 'berechnet', method: 'pauschal', factor: 0.25, assessedListPriceEur: 13_000, privateUseEur: 1_560, commute: null, capped: false, vat: { baseEur: 4_992, vatEur: 948.48, freeOfVatEur: 1_248 } })
      }),
      http.post(`${BASE_URL}/firmenwagen/buchen`, () => {
        booked++
        return HttpResponse.json([])
      }),
    )
    renderBusiness('firmenwagen')
    fireEvent.click(await screen.findByTestId('kfz-antrieb-elektro'))
    fireEvent.change(screen.getByTestId('kfz-listPriceGrossEur'), { target: { value: '52000' } })
    fireEvent.change(screen.getByTestId('kfz-acquired'), { target: { value: '2024-05-01' } })
    fireEvent.click(screen.getByTestId('kfz-berechnen'))
    expect((await screen.findByTestId('kfz-privatanteil')).textContent?.replace(/\s/g, ' ')).toContain('1.560,00 €')
    expect(screen.getByText(/nur zu 0,25/)).toBeTruthy()
    expect(sent[0]).toMatchObject({ drive: 'elektro', listPriceGrossEur: 52_000, acquired: '2024-05-01', method: 'pauschal', monthsInBusiness: 12, businessShareOver50: true })
    expect(booked).toBe(0)
    fireEvent.click(screen.getByTestId('kfz-buchen'))
    await waitFor(() => expect(booked).toBe(1))
    expect(await screen.findByTestId('kfz-gebucht')).toBeTruthy()
  })

  it('asks for the list price and the date before it computes', async () => {
    useBusinessDefaults()
    renderBusiness('firmenwagen')
    fireEvent.click(await screen.findByTestId('kfz-berechnen'))
    expect(await screen.findByText(/Listenpreis und Anschaffungsdatum/)).toBeTruthy()
  })

  it('says the 1 % rule needs more than half business use', async () => {
    useBusinessDefaults()
    server.use(http.post(`${BASE_URL}/firmenwagen`, () => HttpResponse.json({ kind: 'nicht_zulaessig', reason: 'betriebliche_nutzung_bis_50' })))
    renderBusiness('firmenwagen')
    fireEvent.change(await screen.findByTestId('kfz-listPriceGrossEur'), { target: { value: '40000' } })
    fireEvent.change(screen.getByTestId('kfz-acquired'), { target: { value: '2022-01-01' } })
    fireEvent.click(screen.getByTestId('kfz-ueber50-nein'))
    fireEvent.click(screen.getByTestId('kfz-berechnen'))
    expect(await screen.findByTestId('kfz-nicht-zulaessig')).toBeTruthy()
  })
})
