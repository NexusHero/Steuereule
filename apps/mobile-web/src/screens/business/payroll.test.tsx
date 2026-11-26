// ADR-0101 §22: payroll runs are booked from the page; the Lohnsteuer-Anmeldung is shown per period.
import { describe, it, expect } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../../test/test-msw-server'
import { BASE_URL, renderBusiness, useBusinessDefaults } from './businessTestKit'

const OVERVIEW = {
  runs: [{ id: 'l1', month: 1, kind: 'regulaer', employee: 'Anna', grossEur: 3000, netEur: 1894, wageTaxEur: 450, employerChargesEur: 640, entryNumber: 1 }],
  wageTaxPeriod: 'monat',
  wageTaxReturns: [{ label: '01/2025', due: '2025-02-10', kennzahlen: { '86': 1, '42': 450, '83': 450 } }],
  minijobCharges: [{ month: 1, totalEur: 208.62 }],
  unassignedChurchCodes: [],
}

describe('the wages', () => {
  it('shows the Lohnsteuer-Anmeldung and the Minijob charges', async () => {
    useBusinessDefaults()
    server.use(http.get(`${BASE_URL}/lohn`, () => HttpResponse.json(OVERVIEW)))
    renderBusiness('lohn')
    const lsta = await screen.findByTestId('lohn-lsta-01/2025')
    expect(lsta.textContent).toContain('fällig 10.02.2025')
    expect(lsta.textContent).toContain('Kz 42')
    expect(screen.getByTestId('lohn-minijob').textContent?.replace(/\s/g, ' ')).toContain('208,62 €')
  })

  it('books a Minijob with its gross only', async () => {
    useBusinessDefaults()
    const posted: unknown[] = []
    server.use(
      http.get(`${BASE_URL}/lohn`, () => HttpResponse.json({ ...OVERVIEW, runs: [], wageTaxReturns: [], minijobCharges: [] })),
      http.post(`${BASE_URL}/lohn`, async ({ request }) => {
        posted.push(await request.json())
        return HttpResponse.json({})
      }),
    )
    renderBusiness('lohn')
    fireEvent.click(await screen.findByTestId('lohn-art-minijob'))
    fireEvent.change(screen.getByTestId('lohn-employee'), { target: { value: 'Ben' } })
    fireEvent.change(screen.getByTestId('lohn-month'), { target: { value: '3' } })
    fireEvent.change(screen.getByTestId('lohn-grossEur'), { target: { value: '556' } })
    fireEvent.click(screen.getByTestId('lohn-buchen'))
    await waitFor(() => expect(posted).toEqual([{ month: 3, kind: 'minijob', employee: 'Ben', grossEur: 556, statutoryHealthInsured: true, rvExempt: false, u1Applies: true }]))
  })

  it('books an employee with the pauschale Lohnsteuer and another community, and a Minijob without U1', async () => {
    useBusinessDefaults()
    const posted: unknown[] = []
    server.use(
      http.get(`${BASE_URL}/lohn`, () => HttpResponse.json({ ...OVERVIEW, runs: [], wageTaxReturns: [], minijobCharges: [] })),
      http.post(`${BASE_URL}/lohn`, async ({ request }) => {
        posted.push(await request.json())
        return HttpResponse.json({})
      }),
    )
    renderBusiness('lohn')
    fireEvent.change(await screen.findByTestId('lohn-employee'), { target: { value: 'Anna' } })
    fireEvent.change(screen.getByTestId('lohn-month'), { target: { value: '2' } })
    fireEvent.change(screen.getByTestId('lohn-grossEur'), { target: { value: '3000' } })
    fireEvent.change(screen.getByTestId('lohn-flatWageTaxEur'), { target: { value: '50' } })
    fireEvent.click(screen.getByTestId('lohn-kirche-andere'))
    fireEvent.click(screen.getByTestId('lohn-kirche-iw'))
    fireEvent.click(screen.getByTestId('lohn-buchen'))
    await waitFor(() => expect(posted).toEqual([{ month: 2, kind: 'regulaer', employee: 'Anna', grossEur: 3000, flatWageTaxEur: 50, church: 'iw' }]))

    fireEvent.click(screen.getByTestId('lohn-art-minijob'))
    fireEvent.change(screen.getByTestId('lohn-employee'), { target: { value: 'Ben' } })
    fireEvent.change(screen.getByTestId('lohn-month'), { target: { value: '3' } })
    fireEvent.change(screen.getByTestId('lohn-grossEur'), { target: { value: '500' } })
    fireEvent.click(screen.getByTestId('lohn-ueber-30'))
    fireEvent.click(screen.getByTestId('lohn-buchen'))
    await waitFor(() => expect(posted[1]).toMatchObject({ kind: 'minijob', u1Applies: false }))
  })

  it('shows the Land line, the flat-rate lines in form order, and says when a community has no line', async () => {
    useBusinessDefaults()
    const overview = {
      ...OVERVIEW,
      wageTaxReturns: [{ label: '01/2025', due: '2025-02-10', kennzahlen: { '83': 528, '73': 8, '42': 450, '41': 50, '48': 500, '86': 1 } }],
      unassignedChurchCodes: ['fb'],
    }
    server.use(http.get(`${BASE_URL}/lohn`, () => HttpResponse.json(overview)))
    renderBusiness('lohn')
    const lsta = await screen.findByTestId('lohn-lsta-01/2025')
    const text = lsta.textContent ?? ''
    expect(text.indexOf('Kz 86')).toBeLessThan(text.indexOf('Kz 41'))
    expect(text.indexOf('Kz 48')).toBeLessThan(text.indexOf('Kz 73'))
    expect(text.indexOf('Kz 73')).toBeLessThan(text.indexOf('Kz 83'))
    expect(text).toContain('Zeile deines Bundeslandes')
    expect(screen.getByTestId('lohn-kirche-ohne-zeile').textContent).toContain('FB')
  })
})
