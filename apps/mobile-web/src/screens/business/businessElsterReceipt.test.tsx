// The retry of the ELSTER fill-in help and the quick entry, and taking a business receipt's draft over and back.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { AdvisorActionProposal } from '@steuereule/core'
import { server } from '../../../test/test-msw-server'
import { BASE_URL, BUSINESS_ELSTER_FORMS, renderBusiness, useBusinessDefaults, useElsterForms, YEAR } from './businessTestKit'

const capture = vi.fn()
vi.mock('../../lib/receipts/captureReceipt', () => ({ captureReceipt: (...args: unknown[]) => capture(...args) }))

const refusal = (status: number) => HttpResponse.json({ statusCode: status, code: 'X', message: 'Kurz kaputt.' }, { status })

describe('the ELSTER fill-in help: a failed read', () => {
  it('retries the list of forms', async () => {
    let calls = 0
    server.use(http.get(`${BASE_URL}/elster`, () => (++calls === 1 ? refusal(500) : HttpResponse.json({ year: YEAR, forms: BUSINESS_ELSTER_FORMS }))))
    server.use(http.get(`${BASE_URL}/elster/anlage-euer`, () => HttpResponse.json({ form: 'anlage-euer', instance: null, year: YEAR, status: 'published', note: null, sourceUrl: null, lineNumbersAvailable: true, lines: [] })))
    renderBusiness('elster')
    fireEvent.click(await screen.findByTestId('fehler-erneut-versuchen'))
    expect(await screen.findByTestId('elster-formular-anlage-euer')).toBeTruthy()
    expect(calls).toBe(2)
    expect(await screen.findByTestId('elster-seite')).toBeTruthy()
    expect(screen.getByTestId('elster-formular-anlage-euer')).toBeTruthy()
  })

  it('retries the form that did not load', async () => {
    useElsterForms()
    let calls = 0
    server.use(http.get(`${BASE_URL}/elster/anlage-euer`, () => (++calls === 1 ? refusal(500) : HttpResponse.json({ form: 'anlage-euer', instance: null, year: YEAR, status: 'published', note: null, sourceUrl: null, lineNumbersAvailable: true, lines: [{ id: 'euer.x', zeile: '12', kennzahlen: [], label: 'Betriebseinnahmen', column: null, value: 5 }] }))))
    renderBusiness('elster')
    fireEvent.click(await screen.findByTestId('fehler-erneut-versuchen'))
    expect(await screen.findByTestId('elster-zeile-euer.x')).toBeTruthy()
  })
})

describe('the quick entry: a failed read', () => {
  it('retries the closing it reads the totals from', async () => {
    let calls = 0
    server.use(http.get(`${BASE_URL}/abschluss`, () => (++calls === 1 ? refusal(500) : HttpResponse.json({ mode: 'euer', integrity: { ok: true }, euer: { totals: { einnahmen: 0, ausgaben: 0 }, profit: { profitEur: 0 } }, bilanz: null }))))
    renderBusiness('erfassung')
    fireEvent.click(await screen.findByTestId('fehler-erneut-versuchen'))
    expect(await screen.findByTestId('erfassung-buchen')).toBeTruthy()
  })
})

describe('the business receipt: taking the draft back', () => {
  const DRAFT = {
    actionId: 'act-r1', status: 'pending', screen: 'buchung', field: 'draft', instance: null, label: 'Buchung: Papier', previousValue: null, expectedPreviousValue: null,
    newValue: JSON.stringify({ date: `${YEAR}-03-01`, documentNumber: 'RE-1', text: 'Papier', lines: [{ account: '4930', side: 'debit', amount: 1190 }, { account: '1200', side: 'credit', amount: 1190 }] }),
    beforeRefundEur: 0, afterRefundEur: 0, deltaEur: 0, reason: 'Aus der Rechnung gelesen.', sourceId: 'estg-4-3', paragraph: '§ 4 Abs. 3 EStG',
  } as unknown as AdvisorActionProposal

  beforeEach(() => {
    capture.mockReset()
    useBusinessDefaults()
  })

  it('books the draft, and undoes it again from the card', async () => {
    capture.mockResolvedValue({ ok: true, response: { stagedAction: DRAFT } })
    const calls: string[] = []
    server.use(
      http.post(`*/v1/steuerjahre/${YEAR}/advisor/actions/act-r1/apply`, () => { calls.push('apply'); return HttpResponse.json({}) }),
      http.post(`*/v1/steuerjahre/${YEAR}/advisor/actions/act-r1/undo`, () => { calls.push('undo'); return HttpResponse.json({}) }),
    )
    renderBusiness('buch')
    fireEvent.change(await screen.findByTestId('beleg-geschaeft-datei-input'), { target: { files: [new File(['x'], 'r.pdf', { type: 'application/pdf' })] } })
    fireEvent.click(await screen.findByTestId('buchung-entwurf-uebernehmen'))
    fireEvent.click(await screen.findByTestId('buchung-entwurf-rueckgaengig'))
    await waitFor(() => expect(calls).toEqual(['apply', 'undo']))
    expect(await screen.findByTestId('buchung-entwurf-uebernehmen')).toBeTruthy()
  })
})
