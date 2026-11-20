// Home, book, bank, assets and closing of the self-employed area: the error and refusal paths, the retry of
// a failed first read, and the corners of the forms (ADR-0101).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import { Platform } from 'react-native'
import { http, HttpResponse } from 'msw'
import { findAccount } from '@steuereule/core'
import type { BookDto, JournalEntryDto } from '@steuereule/api-client'
import { server } from '../../test-msw-server'
import { BASE_PROFILE, BASE_URL, CATALOGUES, EMPTY_BOOK, renderBusiness, useBusinessDefaults, useCatalogues, YEAR } from './businessTestKit'

afterEach(() => vi.restoreAllMocks())

const problem = (status: number, message: string, code = 'X') => HttpResponse.json({ statusCode: status, code, message }, { status })

const ENTRY: JournalEntryDto = {
  number: 3,
  date: '2025-03-01',
  documentNumber: 'RE-3',
  receiptRef: null,
  text: 'Bürobedarf',
  lines: [
    { account: '4930', side: 'debit', amount: 10000, taxKey: 'none', taxPart: null },
    { account: '1200', side: 'credit', amount: 10000, taxKey: 'none', taxPart: null },
  ],
  reversalOf: null,
  reversedBy: null,
}
const STORNO: JournalEntryDto = { ...ENTRY, number: 4, reversalOf: 3 }
const REVERSED: JournalEntryDto = { ...ENTRY, number: 3, reversedBy: 4 }
const BOOK: BookDto = { ...EMPTY_BOOK, entries: [REVERSED, STORNO] }

/** First read fails once, then answers: the retry button of the error state brings the page. */
function failOnce(url: string, body: unknown, status = 500) {
  let calls = 0
  server.use(
    http.get(url, () => {
      calls += 1
      return calls === 1 ? problem(status, 'Kurz kaputt.') : HttpResponse.json(body as object)
    }),
  )
}

describe('the overview', () => {
  it('retries the first read from the error state, and the page appears', async () => {
    failOnce(BASE_URL, BASE_PROFILE)
    server.use(http.get(`${BASE_URL}/buch`, () => HttpResponse.json(EMPTY_BOOK)), http.get(`${BASE_URL}/bank`, () => HttpResponse.json([])), http.get(`${BASE_URL}/abschluss`, () => problem(409, 'x')))
    renderBusiness(undefined)
    expect(await screen.findByTestId('business-fehler')).toBeTruthy()
    fireEvent.click(screen.getByTestId('fehler-erneut-versuchen'))
    expect((await screen.findByTestId('business-status')).textContent).toBe('Art offen · EÜR · SKR03')
  })

  it('points to the open work and opens its page: the kind, the missing bookings, the bank rows', async () => {
    useBusinessDefaults(BASE_PROFILE)
    server.use(http.get(`${BASE_URL}/bank`, () => HttpResponse.json([{ id: 'u1', status: 'offen', entryNumber: null, transaction: { bookingDate: '2025-04-02', amount: -4200, counterpartyName: null, reference: 'RE 5' }, suggestion: null }, { id: 'u2', status: 'gebucht', entryNumber: 1, transaction: { bookingDate: '2025-04-02', amount: -4200, counterpartyName: null, reference: 'RE 6' }, suggestion: null }])))
    const onOpenPage = vi.fn()
    renderBusiness(undefined, { onOpenPage })
    fireEvent.click(await screen.findByTestId('business-offen-art'))
    expect(onOpenPage).toHaveBeenLastCalledWith('profil')
    fireEvent.click(screen.getByTestId('business-offen-buchungen'))
    expect(onOpenPage).toHaveBeenLastCalledWith('erfassung')
    const bank = await screen.findByTestId('business-offen-bank')
    expect(within(bank).getByText('1 Bankumsatz zu prüfen')).toBeTruthy()
    fireEvent.click(bank)
    expect(onOpenPage).toHaveBeenLastCalledWith('bank')
  })

  it('sends a Bilanz without bookings to the book, and names a loss as „Verlust“ from the closing in cents', async () => {
    useBusinessDefaults({ ...BASE_PROFILE, confirmedKind: 'gewerbe', mode: 'bilanz' })
    server.use(http.get(`${BASE_URL}/abschluss`, () => HttpResponse.json({ mode: 'bilanz', integrity: { ok: true }, euer: null, bilanz: { incomeStatement: { profit: -250000 }, balanceSheet: { totalAktiva: 0, totalPassiva: 0 } } })))
    const onOpenPage = vi.fn()
    renderBusiness(undefined, { onOpenPage })
    fireEvent.click(await screen.findByTestId('business-offen-buchungen'))
    expect(onOpenPage).toHaveBeenCalledWith('buch')
    expect((await screen.findByTestId('business-gewinn')).textContent).toBe('Verlust 2.500,00 €')
  })

  it('shows no profit while the closing is not readable, and says the book is still loading', async () => {
    server.use(http.get(BASE_URL, () => HttpResponse.json({ ...BASE_PROFILE, confirmedKind: 'freiberuf' })), http.get(`${BASE_URL}/buch`, () => new Promise(() => {})), http.get(`${BASE_URL}/bank`, () => HttpResponse.json([])), http.get(`${BASE_URL}/abschluss`, () => problem(409, 'x')))
    renderBusiness(undefined)
    expect(await screen.findByText('Buch lädt …')).toBeTruthy()
    expect(screen.queryByTestId('business-gewinn')).toBeNull()
    expect(screen.getByText('Nichts offen.')).toBeTruthy()
  })

  it('shows a profit from a closing without Euro figures as no number at all', async () => {
    useBusinessDefaults({ ...BASE_PROFILE, confirmedKind: 'gewerbe' })
    server.use(http.get(`${BASE_URL}/abschluss`, () => HttpResponse.json({ mode: 'euer', integrity: { ok: true }, euer: null, bilanz: null })))
    renderBusiness(undefined)
    await screen.findByTestId('business-status')
    expect(screen.queryByTestId('business-gewinn')).toBeNull()
  })

  it('calls the partner „Partner“ when no first name is known, and switches back to A', async () => {
    useBusinessDefaults()
    server.use(http.get(`*/v1/steuerjahre/${YEAR}/kopplung`, () => HttpResponse.json({ filingType: 'zusammen', personBUserId: null, invitationCode: null, personBHasOwnAccount: false, personB: { firstName: '  ' } })))
    const onChangePerson = vi.fn()
    renderBusiness(undefined, { onChangePerson })
    const b = await screen.findByTestId('business-person-B')
    expect(b.textContent).toBe('Partner')
    fireEvent.click(screen.getByTestId('business-person-A'))
    expect(onChangePerson).toHaveBeenCalledWith('A')
  })

  it('goes back through the frame\'s back button', async () => {
    useBusinessDefaults()
    const onBack = vi.fn()
    renderBusiness(undefined, { onBack })
    fireEvent.click(await screen.findByTestId('business-zurueck'))
    expect(onBack).toHaveBeenCalled()
  })

  it('names the year\'s kind from the profile on a narrow and a wide screen', async () => {
    useBusinessDefaults({ ...BASE_PROFILE, confirmedKind: 'gewerbe' })
    const original = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true })
    window.dispatchEvent(new Event('resize'))
    renderBusiness(undefined)
    expect((await screen.findByTestId('business-status')).textContent).toBe('Gewerbe · EÜR · SKR03')
    Object.defineProperty(window, 'innerWidth', { value: original, configurable: true })
  })
})

describe('the book', () => {
  it('retries a failed first read', async () => {
    failOnce(`${BASE_URL}/buch`, EMPTY_BOOK)
    renderBusiness('buch')
    fireEvent.click(await screen.findByTestId('fehler-erneut-versuchen'))
    expect(await screen.findByTestId('buch-leer')).toBeTruthy()
  })

  it('shows the Storno entry as „Storno zu 3“, the reversed one as „storniert“, and offers Storno on neither', async () => {
    useBusinessDefaults(BASE_PROFILE, BOOK)
    renderBusiness('buch')
    expect((await screen.findByTestId('buch-eintrag-4')).textContent).toContain('Storno zu 3')
    expect(screen.getByTestId('buch-eintrag-3').textContent).toContain('storniert')
    expect(screen.queryByTestId('buch-storno-3')).toBeNull()
    expect(screen.queryByTestId('buch-storno-4')).toBeNull()
  })

  it('reverses with the last day of the year when the year is not the current one, and shows a refusal with its reason', async () => {
    useBusinessDefaults(BASE_PROFILE, { ...EMPTY_BOOK, entries: [ENTRY] })
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2030-06-01T10:00:00Z') })
    let body: { date: string } | null = null
    server.use(
      http.post(`${BASE_URL}/buchungen/3/storno`, async ({ request }) => {
        body = (await request.json()) as typeof body
        return problem(403, 'Das Jahr ist festgeschrieben.')
      }),
    )
    renderBusiness('buch')
    fireEvent.click(await screen.findByTestId('buch-storno-3'))
    vi.useRealTimers()
    expect(await screen.findByTestId('business-speichern-fehler')).toBeTruthy()
    expect(screen.getByText('Das Jahr ist festgeschrieben.')).toBeTruthy()
    expect(body!.date).toBe(`${YEAR}-12-31`)
  })

  it('reverses with today when the year is the current one', async () => {
    useBusinessDefaults(BASE_PROFILE, { ...EMPTY_BOOK, entries: [ENTRY] })
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(`${YEAR}-06-01T10:00:00Z`) })
    let body: { date: string } | null = null
    server.use(
      http.post(`${BASE_URL}/buchungen/3/storno`, async ({ request }) => {
        body = (await request.json()) as typeof body
        return HttpResponse.json(STORNO, { status: 201 })
      }),
    )
    renderBusiness('buch')
    fireEvent.click(await screen.findByTestId('buch-storno-3'))
    vi.useRealTimers()
    await waitFor(() => expect(body).not.toBeNull())
    expect(body!.date).toBe(`${YEAR}-06-01`)
  })

  it('names the account while typing it, and a booking on the credit side carries the output VAT key there', async () => {
    useBusinessDefaults()
    let body: { lines: { side: string; taxKey?: string }[] } | null = null
    server.use(
      http.post(`${BASE_URL}/buchungen`, async ({ request }) => {
        body = (await request.json()) as typeof body
        return HttpResponse.json(ENTRY, { status: 201 })
      }),
    )
    renderBusiness('buch')
    fireEvent.click(await screen.findByTestId('buch-neu'))
    fireEvent.change(screen.getByTestId('buch-soll'), { target: { value: '1200' } })
    fireEvent.change(screen.getByTestId('buch-haben'), { target: { value: '8400' } })
    expect(screen.getByText(findAccount('SKR03', '1200')!.label)).toBeTruthy()
    expect(screen.getByText(findAccount('SKR03', '8400')!.label)).toBeTruthy()
    fireEvent.change(screen.getByTestId('buch-datum'), { target: { value: '01.03.2025' } })
    fireEvent.change(screen.getByTestId('buch-text'), { target: { value: 'Honorar' } })
    fireEvent.change(screen.getByTestId('buch-belegnummer'), { target: { value: 'AR-1' } })
    fireEvent.change(screen.getByTestId('buch-betrag'), { target: { value: '119' } })
    fireEvent.click(screen.getByTestId('buch-schluessel-ust19'))
    fireEvent.click(screen.getByTestId('buch-buchen'))
    await waitFor(() => expect(body).not.toBeNull())
    expect(body!.lines.map((l) => [l.side, l.taxKey])).toEqual([['debit', undefined], ['credit', 'ust19']])
    await waitFor(() => expect(screen.queryByTestId('buch-formular')).toBeNull())
  })

  it('shows a refused booking with the API\'s reason and keeps the form', async () => {
    useBusinessDefaults()
    server.use(http.post(`${BASE_URL}/buchungen`, () => problem(400, 'Soll und Haben gleich.')))
    renderBusiness('buch')
    fireEvent.click(await screen.findByTestId('buch-neu'))
    fireEvent.change(screen.getByTestId('buch-datum'), { target: { value: '01.03.2025' } })
    fireEvent.change(screen.getByTestId('buch-text'), { target: { value: 'x' } })
    fireEvent.change(screen.getByTestId('buch-belegnummer'), { target: { value: '1' } })
    fireEvent.change(screen.getByTestId('buch-soll'), { target: { value: '4930' } })
    fireEvent.change(screen.getByTestId('buch-haben'), { target: { value: '4930' } })
    fireEvent.change(screen.getByTestId('buch-betrag'), { target: { value: '10' } })
    fireEvent.click(screen.getByTestId('buch-buchen'))
    expect(await screen.findByText('Soll und Haben gleich.')).toBeTruthy()
    expect(screen.getByTestId('buch-formular')).toBeTruthy()
  })

  it('locks the book up to a date, and refuses an invalid one before asking the API', async () => {
    useBusinessDefaults()
    let body: unknown = null
    server.use(
      http.post(`${BASE_URL}/festschreibung`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ ...EMPTY_BOOK, lockedThrough: '2025-03-31' })
      }),
    )
    renderBusiness('buch')
    const date = await screen.findByTestId('buch-fest-datum')
    expect(screen.getByTestId('buch-festschreiben').getAttribute('aria-disabled')).toBe('true')
    fireEvent.change(date, { target: { value: '31.03.2025' } })
    fireEvent.click(screen.getByTestId('buch-festschreiben'))
    await waitFor(() => expect(body).toEqual({ through: '2025-03-31' }))
  })

  it('shows the refusal of a Festschreibung', async () => {
    useBusinessDefaults()
    server.use(http.post(`${BASE_URL}/festschreibung`, () => problem(409, 'Schon fester.')))
    renderBusiness('buch')
    fireEvent.change(await screen.findByTestId('buch-fest-datum'), { target: { value: '31.03.2025' } })
    fireEvent.click(screen.getByTestId('buch-festschreiben'))
    expect(await screen.findByText('Schon fester.')).toBeTruthy()
  })

  it('says a 99.99.2025 date is no date, not locking anything', async () => {
    useBusinessDefaults()
    const lock = vi.fn()
    server.use(http.post(`${BASE_URL}/festschreibung`, () => { lock(); return HttpResponse.json(EMPTY_BOOK) }))
    renderBusiness('buch')
    fireEvent.change(await screen.findByTestId('buch-fest-datum'), { target: { value: '99.99.2025' } })
    fireEvent.click(screen.getByTestId('buch-festschreiben'))
    await waitFor(() => expect(lock).not.toHaveBeenCalled())
  })
})

describe('the bank', () => {
  const ROW = (id: string, over: object = {}) => ({ id, status: 'offen', entryNumber: null, transaction: { bookingDate: '2025-04-02', amount: -4200, counterpartyName: 'Büro GmbH', reference: 'RE 5' }, suggestion: null, ...over })
  const pick = (content: string) => fireEvent.change(screen.getByTestId('bank-datei-input'), { target: { files: [{ text: async () => content }] } })

  it('retries a failed first read', async () => {
    failOnce(`${BASE_URL}/bank`, [])
    renderBusiness('bank')
    fireEvent.click(await screen.findByTestId('fehler-erneut-versuchen'))
    expect(await screen.findByTestId('bank-leer')).toBeTruthy()
  })

  it('opens the file chooser from the button', async () => {
    server.use(http.get(`${BASE_URL}/bank`, () => HttpResponse.json([])))
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    renderBusiness('bank')
    fireEvent.click(await screen.findByTestId('bank-datei-waehlen'))
    expect(click).toHaveBeenCalled()
  })

  it('imports a CAMT.053 statement as such', async () => {
    server.use(http.get(`${BASE_URL}/bank`, () => HttpResponse.json([])))
    let body: unknown = null
    server.use(http.post(`${BASE_URL}/bank/import`, async ({ request }) => { body = await request.json(); return HttpResponse.json({ added: 1, duplicates: 0, outsideYear: 0 }, { status: 201 }) }))
    renderBusiness('bank')
    fireEvent.click(await screen.findByTestId('bank-quelle-camt053'))
    pick('<xml/>')
    expect(await screen.findByTestId('bank-ergebnis')).toBeTruthy()
    expect(body).toEqual({ format: 'camt053', content: '<xml/>' })
  })

  it('asks for the columns of an unknown bank before reading the file', async () => {
    server.use(http.get(`${BASE_URL}/bank`, () => HttpResponse.json([])))
    const imported = vi.fn()
    server.use(http.post(`${BASE_URL}/bank/import`, () => { imported(); return HttpResponse.json({ added: 0, duplicates: 0, outsideYear: 0 }, { status: 201 }) }))
    renderBusiness('bank')
    fireEvent.click(await screen.findByTestId('bank-quelle-eigene'))
    pick('a;b')
    expect(await screen.findByText('Gib Buchungstag, Betrag und Verwendungszweck an.')).toBeTruthy()
    expect(imported).not.toHaveBeenCalled()
  })

  it('shows the API\'s reason when the import is refused', async () => {
    server.use(http.get(`${BASE_URL}/bank`, () => HttpResponse.json([])), http.post(`${BASE_URL}/bank/import`, () => problem(400, 'Die Datei ist kein Kontoauszug.')))
    renderBusiness('bank')
    await screen.findByTestId('bank-datei-input')
    pick('quatsch')
    expect(await screen.findByText('Die Datei ist kein Kontoauszug.')).toBeTruthy()
    expect(screen.queryByTestId('bank-ergebnis')).toBeNull()
  })

  it('books a row without suggestion with the account typed, and shows a credit in the reference name', async () => {
    server.use(http.get(`${BASE_URL}/bank`, () => HttpResponse.json([ROW('u1', { transaction: { bookingDate: '2025-04-02', amount: 5000, counterpartyName: null, reference: 'Rechnung 9' } })])))
    let body: unknown = null
    server.use(http.post(`${BASE_URL}/bank/u1/buchen`, async ({ request }) => { body = await request.json(); return HttpResponse.json(ENTRY, { status: 201 }) }))
    renderBusiness('bank')
    const row = await screen.findByTestId('bank-zeile-u1')
    expect(within(row).getByText('Rechnung 9')).toBeTruthy()
    expect(within(row).getByText(/^\+50,00\s€$/)).toBeTruthy()
    fireEvent.change(screen.getByTestId('bank-konto-u1'), { target: { value: ' 8400 ' } })
    fireEvent.click(screen.getByTestId('bank-buchen-u1'))
    await waitFor(() => expect(body).toEqual({ account: '8400', remember: false }))
  })

  it('shows the refusal of a booking and of an ignore', async () => {
    server.use(
      http.get(`${BASE_URL}/bank`, () => HttpResponse.json([ROW('u1', { suggestion: { ruleId: 'r', account: '4930', taxKey: 'none', text: 'Büro' } })])),
      http.post(`${BASE_URL}/bank/u1/buchen`, () => problem(409, 'Schon gebucht.')),
      http.post(`${BASE_URL}/bank/u1/ignorieren`, () => problem(500, 'Server hat sich verschluckt.')),
    )
    renderBusiness('bank')
    fireEvent.click(await screen.findByTestId('bank-buchen-u1'))
    expect(await screen.findByText('Schon gebucht.')).toBeTruthy()
    fireEvent.click(screen.getByTestId('bank-ignorieren-u1'))
    expect(await screen.findByText('Server hat sich verschluckt.')).toBeTruthy()
  })

  it('says the file import works in the browser when it does not run on the web', async () => {
    server.use(http.get(`${BASE_URL}/bank`, () => HttpResponse.json([])))
    const original = Platform.OS
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true })
    try {
      renderBusiness('bank')
      expect(await screen.findByText('Das Einlesen geht im Browser.')).toBeTruthy()
      expect(screen.queryByTestId('bank-datei-waehlen')).toBeNull()
    } finally {
      Object.defineProperty(Platform, 'OS', { value: original, configurable: true })
    }
  })
})

describe('the assets', () => {
  const REGISTER = { register: { rows: [{ id: 'a1', label: 'Laptop', acquisitionCost: 120000, closingBookValue: 80000 }], totals: {} }, records: [] }
  const fill = (over: Record<string, string> = {}) => {
    const v = { 'anlage-bezeichnung': 'Drucker', 'anlage-konto': '0670', 'anlage-datum': '15.02.2025', 'anlage-kosten': '500', ...over }
    for (const [id, value] of Object.entries(v)) fireEvent.change(screen.getByTestId(id), { target: { value } })
  }

  it('retries a failed first read', async () => {
    failOnce(`${BASE_URL}/anlagen`, { register: { rows: [], totals: {} }, records: [] })
    renderBusiness('anlagen')
    fireEvent.click(await screen.findByTestId('fehler-erneut-versuchen'))
    expect(await screen.findByTestId('anlagen-leer')).toBeTruthy()
  })

  it('records a disposal with the date and proceeds, and refuses an unreadable one', async () => {
    server.use(http.get(`${BASE_URL}/anlagen`, () => HttpResponse.json(REGISTER)))
    let body: unknown = null
    server.use(http.post(`${BASE_URL}/anlagen/a1/abgang`, async ({ request }) => { body = await request.json(); return HttpResponse.json({}, { status: 201 }) }))
    renderBusiness('anlagen')
    fireEvent.click(await screen.findByTestId('anlage-abgang-a1'))
    fireEvent.click(screen.getByTestId('anlage-abgang-buchen'))
    expect(await screen.findByText('Bitte prüfe die Angaben.')).toBeTruthy()
    fireEvent.change(screen.getByTestId('anlage-abgang-datum'), { target: { value: '30.06.2025' } })
    fireEvent.change(screen.getByTestId('anlage-abgang-erloes'), { target: { value: '300,50' } })
    fireEvent.click(screen.getByTestId('anlage-abgang-buchen'))
    await waitFor(() => expect(body).toEqual({ date: '2025-06-30', proceedsCents: 30050 }))
    await waitFor(() => expect(screen.queryByTestId('anlage-abgang-buchen')).toBeNull())
  })

  it('records a disposal without proceeds, and shows the API\'s refusal', async () => {
    server.use(http.get(`${BASE_URL}/anlagen`, () => HttpResponse.json(REGISTER)), http.post(`${BASE_URL}/anlagen/a1/abgang`, () => problem(409, 'Schon ausgeschieden.')))
    renderBusiness('anlagen')
    fireEvent.click(await screen.findByTestId('anlage-abgang-a1'))
    fireEvent.change(screen.getByTestId('anlage-abgang-datum'), { target: { value: '30.06.2025' } })
    fireEvent.click(screen.getByTestId('anlage-abgang-buchen'))
    expect(await screen.findByText('Schon ausgeschieden.')).toBeTruthy()
  })

  it('adds an asset with its own useful life, and offers no table category for a GWG', async () => {
    server.use(http.get(`${BASE_URL}/anlagen`, () => HttpResponse.json(REGISTER)))
    useCatalogues()
    let body: unknown = null
    server.use(http.post(`${BASE_URL}/anlagen`, async ({ request }) => { body = await request.json(); return HttpResponse.json({}, { status: 201 }) }))
    renderBusiness('anlagen')
    fireEvent.click(await screen.findByTestId('anlage-neu'))
    fireEvent.click(screen.getByTestId('anlage-methode-gwg'))
    expect(screen.queryByTestId('anlage-kategorie')).toBeNull()
    expect(screen.queryByTestId('anlage-nutzungsdauer')).toBeNull()
    fireEvent.click(screen.getByTestId('anlage-methode-degressive'))
    fill()
    fireEvent.change(screen.getByTestId('anlage-nutzungsdauer'), { target: { value: '5' } })
    fireEvent.click(screen.getByTestId('anlage-speichern'))
    await waitFor(() => expect(body).toEqual({ label: 'Drucker', account: '0670', acquisitionDate: '2025-02-15', acquisitionCostCents: 50000, method: 'degressive', usefulLifeYears: 5 }))
    await waitFor(() => expect(screen.queryByTestId('anlage-formular')).toBeNull())
  })

  it('adds a building with its use and dates, and a machine with the § 7g Sonder-AfA and last year’s profit', async () => {
    server.use(http.get(`${BASE_URL}/anlagen`, () => HttpResponse.json(REGISTER)))
    useCatalogues()
    const bodies: unknown[] = []
    server.use(http.post(`${BASE_URL}/anlagen`, async ({ request }) => { bodies.push(await request.json()); return HttpResponse.json({}, { status: 201 }) }))
    renderBusiness('anlagen')
    fireEvent.click(await screen.findByTestId('anlage-neu'))
    fireEvent.click(screen.getByTestId('anlage-methode-building_degressive'))
    expect(screen.queryByTestId('anlage-kategorie')).toBeNull()
    fill({ 'anlage-bezeichnung': 'Wohnhaus', 'anlage-konto': '0090', 'anlage-kosten': '300000' })
    fireEvent.click(screen.getByTestId('anlage-nutzung-wohnen'))
    fireEvent.change(screen.getByTestId('anlage-gebaeude-completed'), { target: { value: '01.12.2024' } })
    fireEvent.change(screen.getByTestId('anlage-gebaeude-constructionStarted'), { target: { value: '15.11.2023' } })
    fireEvent.click(screen.getByTestId('anlage-speichern'))
    await waitFor(() => expect(bodies[0]).toMatchObject({ method: 'building_degressive', building: { use: 'wohnen', completed: '2024-12-01', constructionStarted: '2023-11-15' } }))

    fireEvent.click(await screen.findByTestId('anlage-neu'))
    fireEvent.click(screen.getByTestId('anlage-methode-linear'))
    fill()
    fireEvent.change(screen.getByTestId('anlage-nutzungsdauer'), { target: { value: '5' } })
    expect(screen.queryByTestId('anlage-gewinn-vorjahr')).toBeNull()
    fireEvent.change(screen.getByTestId('anlage-sonder-afa'), { target: { value: '100' } })
    fireEvent.change(screen.getByTestId('anlage-gewinn-vorjahr'), { target: { value: '80.000,00' } })
    fireEvent.click(screen.getByTestId('anlage-speichern'))
    await waitFor(() => expect(bodies[1]).toMatchObject({ specialDepreciation: { byYear: { '2025': 10_000 }, priorYearProfitEur: 80_000 } }))
  })

  it('refuses a building without a completion date', async () => {
    server.use(http.get(`${BASE_URL}/anlagen`, () => HttpResponse.json(REGISTER)))
    useCatalogues()
    renderBusiness('anlagen')
    fireEvent.click(await screen.findByTestId('anlage-neu'))
    fireEvent.click(screen.getByTestId('anlage-methode-building'))
    fill()
    fireEvent.click(screen.getByTestId('anlage-speichern'))
    expect(await screen.findByText(/Bitte/)).toBeTruthy()
  })

  it('saves the § 15a correction of an asset, keeping the shares of earlier years', async () => {
    server.use(http.get(`${BASE_URL}/anlagen`, () => HttpResponse.json({ ...REGISTER, records: [{ id: 'a1', vatCorrection: JSON.stringify({ inputVatCents: 570_000, originalShare: 1, shareByYear: { '2024': 1 } }) }] })))
    useCatalogues()
    let body: unknown = null
    server.use(http.put(`${BASE_URL}/anlagen/a1/angaben`, async ({ request }) => { body = await request.json(); return HttpResponse.json({}) }))
    renderBusiness('anlagen')
    fireEvent.click(await screen.findByTestId('anlage-15a-a1'))
    fireEvent.change(screen.getByTestId('anlage-15a-vorsteuer'), { target: { value: '5.700,00' } })
    fireEvent.change(screen.getByTestId('anlage-15a-jahr'), { target: { value: '50' } })
    fireEvent.click(screen.getByTestId('anlage-15a-speichern'))
    await waitFor(() => expect(body).toEqual({ vatCorrection: { inputVatCents: 570_000, originalShare: 1, shareByYear: { '2024': 1, '2025': 0.5 } } }))
  })

  it('offers the 75 % AfA of an electric vehicle without a useful life (§ 7 Abs. 2a EStG)', async () => {
    server.use(http.get(`${BASE_URL}/anlagen`, () => HttpResponse.json(REGISTER)))
    useCatalogues()
    let body: unknown = null
    server.use(http.post(`${BASE_URL}/anlagen`, async ({ request }) => { body = await request.json(); return HttpResponse.json({}, { status: 201 }) }))
    renderBusiness('anlagen')
    fireEvent.click(await screen.findByTestId('anlage-neu'))
    fireEvent.click(screen.getByTestId('anlage-methode-elektrofahrzeug'))
    expect(screen.queryByTestId('anlage-nutzungsdauer')).toBeNull()
    fill()
    fireEvent.click(screen.getByTestId('anlage-speichern'))
    await waitFor(() => expect(body).toMatchObject({ method: 'elektrofahrzeug' }))
  })

  it('refuses a form that is incomplete or has a fractional life, and the API\'s refusal of a valid one', async () => {
    server.use(http.get(`${BASE_URL}/anlagen`, () => HttpResponse.json(REGISTER)), http.post(`${BASE_URL}/anlagen`, () => problem(400, 'Konto gibt es nicht.')))
    useCatalogues()
    renderBusiness('anlagen')
    fireEvent.click(await screen.findByTestId('anlage-neu'))
    fireEvent.click(screen.getByTestId('anlage-speichern'))
    expect(await screen.findByText('Bitte prüfe die Angaben.')).toBeTruthy()
    fill()
    fireEvent.change(screen.getByTestId('anlage-nutzungsdauer'), { target: { value: '2,5' } })
    fireEvent.click(screen.getByTestId('anlage-speichern'))
    await waitFor(() => expect(screen.getByText('Bitte prüfe die Angaben.')).toBeTruthy())
    fireEvent.change(screen.getByTestId('anlage-nutzungsdauer'), { target: { value: '' } })
    fireEvent.click(screen.getByTestId('anlage-speichern'))
    expect(await screen.findByText('Konto gibt es nicht.')).toBeTruthy()
    expect(screen.queryByText('Bitte prüfe die Angaben.')).toBeNull()
  })

  it('takes the category from the table by choosing it', async () => {
    server.use(http.get(`${BASE_URL}/anlagen`, () => HttpResponse.json(REGISTER)))
    useCatalogues()
    renderBusiness('anlagen')
    fireEvent.click(await screen.findByTestId('anlage-neu'))
    await screen.findByText(`${CATALOGUES.assetCategories[0]!.label} (1 Jahr)`)
    fireEvent.change(screen.getByTestId('anlage-kategorie'), { target: { value: 'computer' } })
    expect(screen.queryByTestId('anlage-nutzungsdauer')).toBeNull()
  })

  it('books the year\'s depreciation and shows a refusal plainly', async () => {
    server.use(http.get(`${BASE_URL}/anlagen`, () => HttpResponse.json(REGISTER)))
    let calls = 0
    server.use(http.post(`${BASE_URL}/anlagen/abschreibung`, () => { calls += 1; return calls === 1 ? problem(409, 'Die AfA ist schon gebucht.') : HttpResponse.json({}, { status: 201 }) }))
    renderBusiness('anlagen')
    fireEvent.click(await screen.findByTestId('anlage-afa-buchen'))
    expect(await screen.findByText('Die AfA ist schon gebucht.')).toBeTruthy()
    fireEvent.click(screen.getByTestId('anlage-afa-buchen'))
    await waitFor(() => expect(screen.queryByText('Die AfA ist schon gebucht.')).toBeNull())
  })
})

describe('the closing', () => {
  const BILANZ = { mode: 'bilanz', integrity: { ok: true }, euer: null, bilanz: { incomeStatement: { profit: 250000 }, balanceSheet: { totalAktiva: 900000, totalPassiva: 900000 } } }

  it('retries a failed first read', async () => {
    failOnce(`${BASE_URL}/abschluss`, BILANZ)
    renderBusiness('abschluss')
    fireEvent.click(await screen.findByTestId('fehler-erneut-versuchen'))
    expect((await screen.findByTestId('abschluss-aktiva')).textContent).toBe('9.000,00 €')
  })

  it('shows the EÜR totals and the profit, or a dash when there is none', async () => {
    server.use(http.get(`${BASE_URL}/abschluss`, () => HttpResponse.json({ mode: 'euer', integrity: { ok: true }, euer: null, bilanz: null })))
    renderBusiness('abschluss')
    expect((await screen.findByTestId('abschluss-gewinn')).textContent).toBe('–')
  })

  it('says the carry-forward is booked, and a broken chain without a reason shows only the headline', async () => {
    server.use(http.get(`${BASE_URL}/abschluss`, () => HttpResponse.json({ ...BILANZ, integrity: { ok: false } })))
    renderBusiness('abschluss')
    expect(await screen.findByTestId('buch-integritaet-fehler')).toBeTruthy()
    expect(screen.queryByText(/unterbrochen/)).toBeNull()
  })

  it('confirms the carried balance with the next year', async () => {
    server.use(http.get(`${BASE_URL}/abschluss`, () => HttpResponse.json(BILANZ)), http.post(`${BASE_URL}/abschluss/eroeffnung`, () => HttpResponse.json({}, { status: 201 })))
    renderBusiness('abschluss')
    fireEvent.click(await screen.findByTestId('abschluss-eroeffnung'))
    expect((await screen.findByTestId('abschluss-uebertragen')).textContent).toBe(`Eröffnungsbilanz ${YEAR + 1} gebucht.`)
  })

  it('shows a refusal without a reason as the plain save error', async () => {
    server.use(http.get(`${BASE_URL}/abschluss`, () => HttpResponse.json(BILANZ)), http.post(`${BASE_URL}/abschluss/eroeffnung`, () => new HttpResponse(null, { status: 500 })))
    renderBusiness('abschluss')
    fireEvent.click(await screen.findByTestId('abschluss-eroeffnung'))
    expect(await screen.findByTestId('business-speichern-fehler')).toBeTruthy()
  })
})
