// Round 2 of ADR-0101's screens: person switch, the full profession questions, trade-tax inputs, shares,
// the manual CSV mapping, the AfA category, and the business receipt with its booking draft.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { AdvisorActionProposal } from '@steuereule/core'
import { server } from '../../test-msw-server'
import { BASE_PROFILE, BASE_URL, renderBusiness, useBusinessDefaults, useCatalogues, YEAR } from './businessTestKit'

const capture = vi.fn()
vi.mock('../../lib/receipts/captureReceipt', () => ({ captureReceipt: (...args: unknown[]) => capture(...args) }))

function captureBody<T>(url: string, status = 200): { get: () => T | null } {
  let body: T | null = null
  server.use(
    http.put(url, async ({ request }) => {
      body = (await request.json()) as T
      return HttpResponse.json({ ...BASE_PROFILE }, { status })
    }),
  )
  return { get: () => body }
}

describe('the person switch', () => {
  const link = (filingType: string, personBHasOwnAccount = false) =>
    server.use(http.get(`*/v1/steuerjahre/${YEAR}/kopplung`, () => HttpResponse.json({ filingType, personBUserId: null, invitationCode: null, personBHasOwnAccount, personB: { firstName: 'Nora' } })))

  it('offers A and B to a couple filing jointly, and switches', async () => {
    useBusinessDefaults()
    link('zusammen')
    const onChangePerson = vi.fn()
    renderBusiness(undefined, { onChangePerson })
    fireEvent.click(await screen.findByTestId('business-person-B'))
    expect(onChangePerson).toHaveBeenCalledWith('B')
    expect(screen.getByTestId('business-person-B').textContent).toBe('Nora')
  })

  it('shows no switch for a single person', async () => {
    useBusinessDefaults()
    link('keine')
    renderBusiness(undefined, { onChangePerson: vi.fn() })
    await screen.findByTestId('business-status')
    expect(screen.queryByTestId('business-person')).toBeNull()
  })
})

describe('the profession questions', () => {
  beforeEach(() => useCatalogues())

  it('saves the Katalogberuf with the complete professionAnswers object', async () => {
    useBusinessDefaults({ ...BASE_PROFILE, professionAnswers: { ownExpertWork: true, tradesGoods: false } })
    const put = captureBody<{ professionAnswers: Record<string, unknown> }>(BASE_URL)
    renderBusiness('beruf')
    const select = await screen.findByTestId('beruf-katalog')
    await screen.findByText('Architekt/in')
    fireEvent.change(select, { target: { value: 'architekt' } })
    await waitFor(() => expect(put.get()).not.toBeNull())
    expect(put.get()!.professionAnswers).toEqual({ ownExpertWork: true, tradesGoods: false, catalogProfession: 'architekt' })
  })

  it('records the prior assessment, a similar profession and a free activity', async () => {
    useBusinessDefaults()
    const put = captureBody<{ professionAnswers: Record<string, unknown> }>(BASE_URL)
    renderBusiness('beruf')
    fireEvent.click(await screen.findByTestId('beruf-bisher-gewerbe'))
    await waitFor(() => expect(put.get()?.professionAnswers).toEqual({ priorAssessment: 'gewerbe' }))
    fireEvent.click(screen.getByTestId('beruf-aehnlich-ja'))
    await waitFor(() => expect(put.get()?.professionAnswers).toMatchObject({ similarToCatalogProfession: true }))
  })

  it('saves the start date of the profile', async () => {
    useBusinessDefaults()
    const put = captureBody<{ startDate: string }>(BASE_URL)
    renderBusiness('profil')
    fireEvent.change(await screen.findByTestId('profil-beginn'), { target: { value: '01.02.2024' } })
    await waitFor(() => expect(put.get()).toEqual({ startDate: '2024-02-01' }))
  })
})

describe('the trade-tax inputs', () => {
  it('sends only the changed key of tradeTaxInputs, the financing parts complete (the API merges key by key)', async () => {
    useBusinessDefaults({ ...BASE_PROFILE, tradeTaxInputs: { einheitswertEur: 50000, financing: { debtChargesEur: 1000 } } })
    const put = captureBody<{ tradeTaxInputs: unknown }>(BASE_URL)
    renderBusiness('gewerbedaten')
    fireEvent.change(await screen.findByTestId('gewerbedaten-rentImmovableEur'), { target: { value: '12000' } })
    fireEvent.click(screen.getByTestId('gewerbedaten-speichern'))
    await waitFor(() => expect(put.get()).not.toBeNull())
    expect(put.get()!.tradeTaxInputs).toEqual({ financing: { debtChargesEur: 1000, rentImmovableEur: 12000 } })
  })

  it('refuses a value that is no number', async () => {
    useBusinessDefaults()
    renderBusiness('gewerbedaten')
    fireEvent.change(await screen.findByTestId('gewerbedaten-licencesEur'), { target: { value: 'abc' } })
    fireEvent.click(screen.getByTestId('gewerbedaten-speichern'))
    expect(await screen.findByText('Mindestens ein Betrag ist keine Zahl.')).toBeTruthy()
  })
})

describe('the partnership shares', () => {
  it('adds a share to the whole list and removes one', async () => {
    useBusinessDefaults({ ...BASE_PROFILE, partnershipShares: [{ name: 'Alt GbR', kind: 'freiberuf', profitEur: 5000 }] })
    const put = captureBody<{ partnershipShares: unknown[] }>(BASE_URL)
    renderBusiness('beteiligungen')
    expect(await screen.findByTestId('beteiligung-0')).toBeTruthy()
    fireEvent.change(screen.getByTestId('beteiligung-name'), { target: { value: 'Neu OHG' } })
    fireEvent.click(screen.getByTestId('beteiligung-art-gewerbe'))
    fireEvent.change(screen.getByTestId('beteiligung-gewinn'), { target: { value: '8000' } })
    fireEvent.change(screen.getByTestId('beteiligung-messbetrag'), { target: { value: '280' } })
    fireEvent.click(screen.getByTestId('beteiligung-hinzufuegen'))
    await waitFor(() => expect(put.get()).not.toBeNull())
    expect(put.get()!.partnershipShares).toEqual([
      { name: 'Alt GbR', kind: 'freiberuf', profitEur: 5000 },
      { name: 'Neu OHG', kind: 'gewerbe', profitEur: 8000, baseAmountEur: 280 },
    ])
  })
})

describe('the loss facts', () => {
  it('records what the notices still offer in the two years before', async () => {
    useBusinessDefaults()
    server.use(http.get(`${BASE_URL}/verluste`, () => HttpResponse.json({ facts: {}, rules: { carryBackCapEur: 1000000, carryBackYears: 2, forwardBaseEur: 1000000, forwardRate: 0.7 }, businessProfitEur: 100, year: { carryBackDeductedEur: 0, carryForwardDeductedEur: 0, gdeAfterLossesEur: 100, newLossEur: 0, remainingCarryForwardEur: 0 }, carryBack: null })))
    const put = captureBody<{ lossFacts: unknown }>(BASE_URL)
    renderBusiness('verluste')
    const field = await screen.findByTestId('verluste-platz-0')
    fireEvent.change(field, { target: { value: '4000' } })
    fireEvent.blur(field)
    await waitFor(() => expect(put.get()).toEqual({ lossFacts: { roomEur: [4000, 0] } }))
  })
})

describe('the CSV mapping of an unknown bank', () => {
  it('imports with the columns the user named, and asks for the missing ones first', async () => {
    server.use(http.get(`${BASE_URL}/bank`, () => HttpResponse.json([])))
    let body: { mapping?: unknown; preset?: string } | null = null
    server.use(http.post(`${BASE_URL}/bank/import`, async ({ request }) => { body = (await request.json()) as typeof body; return HttpResponse.json({ added: 1, duplicates: 0, outsideYear: 0 }, { status: 201 }) }))
    renderBusiness('bank')
    fireEvent.click(await screen.findByTestId('bank-quelle-eigene'))
    const file = { files: [{ text: async () => 'Tag;Betrag\n' }] }
    fireEvent.change(screen.getByTestId('bank-datei-input'), { target: file })
    expect(await screen.findByText('Gib Buchungstag, Betrag und Verwendungszweck an.')).toBeTruthy()
    expect(body).toBeNull()
    fireEvent.change(screen.getByTestId('bank-map-bookingDate'), { target: { value: 'Tag' } })
    fireEvent.change(screen.getByTestId('bank-map-amount'), { target: { value: 'Betrag' } })
    fireEvent.change(screen.getByTestId('bank-map-reference'), { target: { value: 'Text, 3' } })
    fireEvent.click(screen.getByTestId('bank-map-trenner-tab'))
    fireEvent.change(screen.getByTestId('bank-datei-input'), { target: file })
    await screen.findByTestId('bank-ergebnis')
    expect(body).toEqual({
      format: 'csv',
      content: 'Tag;Betrag\n',
      mapping: { delimiter: '\t', decimal: ',', dateFormat: 'DD.MM.YYYY', bookingDate: { name: 'Tag' }, reference: [{ name: 'Text' }, { index: 3 }], amount: { name: 'Betrag' } },
    })
  })
})

describe('the AfA category of an asset', () => {
  it('sets the useful life from the table: the category goes out, the years are not asked', async () => {
    server.use(http.get(`${BASE_URL}/anlagen`, () => HttpResponse.json({ register: { rows: [], totals: {} }, records: [] })))
    useCatalogues()
    let body: Record<string, unknown> | null = null
    server.use(http.post(`${BASE_URL}/anlagen`, async ({ request }) => { body = (await request.json()) as typeof body; return HttpResponse.json({}, { status: 201 }) }))
    renderBusiness('anlagen')
    fireEvent.click(await screen.findByTestId('anlage-neu'))
    await screen.findByText(/Pkw \(6 Jahre\)/)
    fireEvent.change(screen.getByTestId('anlage-kategorie'), { target: { value: 'car' } })
    expect(screen.queryByTestId('anlage-nutzungsdauer')).toBeNull()
    fireEvent.change(screen.getByTestId('anlage-bezeichnung'), { target: { value: 'Firmenwagen' } })
    fireEvent.change(screen.getByTestId('anlage-konto'), { target: { value: '0320' } })
    fireEvent.change(screen.getByTestId('anlage-datum'), { target: { value: '15.02.2025' } })
    fireEvent.change(screen.getByTestId('anlage-kosten'), { target: { value: '30000' } })
    fireEvent.click(screen.getByTestId('anlage-speichern'))
    await waitFor(() => expect(body).not.toBeNull())
    expect(body).toMatchObject({ category: 'car', method: 'linear', acquisitionCostCents: 3000000 })
    expect(body).not.toHaveProperty('usefulLifeYears')
  })
})

describe('the business receipt', () => {
  const DRAFT = {
    actionId: 'act-r1', status: 'pending', screen: 'buchung', field: 'draft', instance: null, label: 'Buchung: Papier', previousValue: null, expectedPreviousValue: null,
    newValue: JSON.stringify({ date: `${YEAR}-03-01`, documentNumber: 'RE-1', text: 'Papier', lines: [{ account: '4930', side: 'debit', amount: 1190 }, { account: '1200', side: 'credit', amount: 1190 }] }),
    beforeRefundEur: 0, afterRefundEur: 0, deltaEur: 0, reason: 'Aus der Rechnung gelesen.', sourceId: 'estg-4-3', paragraph: '§ 4 Abs. 3 EStG',
  } as unknown as AdvisorActionProposal

  beforeEach(() => {
    capture.mockReset()
    useBusinessDefaults()
  })

  it('reads the file in the chosen direction and shows the result as a booking draft', async () => {
    capture.mockResolvedValue({ ok: true, response: { stagedAction: DRAFT } })
    renderBusiness('buch')
    fireEvent.click(await screen.findByTestId('beleg-richtung-einnahme'))
    fireEvent.change(screen.getByTestId('beleg-geschaeft-datei-input'), { target: { files: [new File(['x'], 'rechnung.pdf', { type: 'application/pdf' })] } })
    expect(await screen.findByTestId('buchung-entwurf-karte')).toBeTruthy()
    expect(capture).toHaveBeenCalledWith(expect.any(File), expect.objectContaining({ kind: 'geschaeftsbeleg', direction: 'einnahme', taxYear: YEAR }))
  })

  it('shows the refusal of the API on the card when taking the draft over fails', async () => {
    capture.mockResolvedValue({ ok: true, response: { stagedAction: DRAFT } })
    server.use(http.post(`*/v1/steuerjahre/${YEAR}/advisor/actions/act-r1/apply`, () => HttpResponse.json({ statusCode: 409, code: 'BOOK_PERIOD_LOCKED', message: 'Der Zeitraum ist festgeschrieben.' }, { status: 409 })))
    renderBusiness('buch')
    fireEvent.change(await screen.findByTestId('beleg-geschaeft-datei-input'), { target: { files: [new File(['x'], 'r.pdf', { type: 'application/pdf' })] } })
    fireEvent.click(await screen.findByTestId('buchung-entwurf-uebernehmen'))
    expect((await screen.findByTestId('buchung-entwurf-fehler')).textContent).toBe('Der Zeitraum ist festgeschrieben.')
  })

  it('says so when the file could not be read', async () => {
    capture.mockResolvedValue({ ok: false, failure: 'read_failed' })
    renderBusiness('buch')
    fireEvent.change(await screen.findByTestId('beleg-geschaeft-datei-input'), { target: { files: [new File(['x'], 'r.pdf', { type: 'application/pdf' })] } })
    expect((await screen.findByTestId('beleg-geschaeft-hinweis')).textContent).toBe('Der Beleg konnte nicht gelesen werden.')
  })
})
