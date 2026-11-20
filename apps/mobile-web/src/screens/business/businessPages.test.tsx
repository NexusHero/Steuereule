// The pages of the self-employed area against the shared contract (MSW handlers, typed by the generated client).
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { BookDto, ElsterHelpDto, JournalEntryDto } from '@steuereule/api-client'
import { server } from '../../test-msw-server'
import { BASE_PROFILE, BASE_URL, EMPTY_BOOK, renderBusiness, useBusinessDefaults, useElsterForms, YEAR } from './businessTestKit'

const SMALL_OK = { eligible: true, priorYearLimitEur: 25_000, currentYearLimitEur: 100_000, crossed: null, foundingYear: false, priorYearKnown: true, turnoverEur: 0, matchesProfile: true }

const ENTRY: JournalEntryDto = {
  number: 1,
  date: '2025-03-01',
  documentNumber: 'RE-1',
  receiptRef: null,
  text: 'Bürobedarf',
  lines: [
    { account: '4930', side: 'debit', amount: 10084, taxKey: 'vst19', taxPart: 'base' },
    { account: '1576', side: 'debit', amount: 1916, taxKey: 'vst19', taxPart: 'tax' },
    { account: '1200', side: 'credit', amount: 12000, taxKey: 'none', taxPart: null },
  ],
  reversalOf: null,
  reversedBy: null,
}
const BOOK_WITH_ENTRY: BookDto = { ...EMPTY_BOOK, entries: [ENTRY] }

afterEach(() => vi.restoreAllMocks())

describe('the overview', () => {
  it('shows a short status, what is open and the links into the pages', async () => {
    useBusinessDefaults({ ...BASE_PROFILE, confirmedKind: 'gewerbe' })
    const onOpenPage = vi.fn()
    renderBusiness(undefined, { onOpenPage })
    expect((await screen.findByTestId('business-status')).textContent).toBe('Gewerbe · EÜR · SKR03')
    expect(screen.getByTestId('business-offen-buchungen')).toBeTruthy()
    fireEvent.click(screen.getByTestId('business-link-bank'))
    expect(onOpenPage).toHaveBeenCalledWith('bank')
    expect(screen.getByTestId('business-link-gewerbesteuer')).toBeTruthy()
  })

  it('leaves Gewerbesteuer out for a Freiberufler and Schnellerfassung out of a Bilanz', async () => {
    useBusinessDefaults({ ...BASE_PROFILE, confirmedKind: 'freiberuf', mode: 'bilanz' })
    renderBusiness(undefined)
    await screen.findByTestId('business-status')
    expect(screen.queryByTestId('business-link-gewerbesteuer')).toBeNull()
    expect(screen.queryByTestId('business-link-erfassung')).toBeNull()
  })

  it('names a broken chain as open work', async () => {
    useBusinessDefaults({ ...BASE_PROFILE, confirmedKind: 'gewerbe' }, { ...BOOK_WITH_ENTRY, integrity: { ok: false, reason: 'Eintrag 1 passt nicht zum Protokoll.', firstBadSeq: 1 } })
    renderBusiness(undefined)
    expect(await screen.findByTestId('business-offen-kette')).toBeTruthy()
  })

  it('says plainly when the switch is off (403)', async () => {
    server.use(http.get(BASE_URL, () => new HttpResponse(null, { status: 403 })))
    renderBusiness(undefined)
    expect(await screen.findByText('Noch nicht freigeschaltet')).toBeTruthy()
    expect(screen.queryByTestId('fehler-erneut-versuchen')).toBeNull()
  })
})

describe('several businesses of one person (ADR-0101 §22)', () => {
  it('switches between the businesses and adds one, then opens it', async () => {
    useBusinessDefaults({ ...BASE_PROFILE, name: 'Übersetzungen' })
    const posted: unknown[] = []
    server.use(
      http.get(`${BASE_URL}/betriebe`, () => HttpResponse.json([{ business: 1, name: 'Übersetzungen', kind: 'freiberuf', mode: 'euer' }, { business: 2, name: null, kind: null, mode: 'euer' }])),
      http.post(`${BASE_URL}/betriebe`, async ({ request }) => {
        posted.push(await request.json())
        return HttpResponse.json({ ...BASE_PROFILE, business: 3, name: 'Onlineshop' }, { status: 201 })
      }),
    )
    const onChangeBusiness = vi.fn()
    renderBusiness(undefined, { onChangeBusiness })
    fireEvent.click(await screen.findByTestId('business-betrieb-2'))
    expect(onChangeBusiness).toHaveBeenCalledWith(2)
    expect(screen.getByTestId('business-betrieb-2').textContent).toBe('Betrieb 2')
    fireEvent.click(screen.getByTestId('business-betrieb-neu'))
    fireEvent.change(screen.getByTestId('business-betrieb-name'), { target: { value: 'Onlineshop' } })
    fireEvent.click(screen.getByTestId('business-betrieb-anlegen'))
    await waitFor(() => expect(onChangeBusiness).toHaveBeenCalledWith(3))
    expect(posted).toEqual([{ name: 'Onlineshop' }])
  })

  it('asks the API for the chosen business on every page', async () => {
    let asked: string | null = null
    useBusinessDefaults()
    server.use(http.get(BASE_URL, ({ request }) => {
      asked = new URL(request.url).searchParams.get('betrieb')
      return HttpResponse.json({ ...BASE_PROFILE, business: 2 })
    }))
    renderBusiness('profil', { business: 2 })
    await waitFor(() => expect(asked).toBe('2'))
  })
})

describe('the profile', () => {
  it('shows the suggestion with its reasons and saves the confirmation', async () => {
    useBusinessDefaults({ ...BASE_PROFILE, suggestion: { suggestion: 'freiberuf', reasons: ['Katalogberuf: Architekt'], basis: ['§ 18 EStG'] } })
    let body: unknown = null
    server.use(
      http.put(BASE_URL, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ ...BASE_PROFILE, confirmedKind: 'freiberuf' })
      }),
    )
    renderBusiness('profil')
    expect(await screen.findByTestId('selbststaendig-profil')).toBeTruthy()
    expect(screen.getByText('Wir schlagen vor: Freiberuf')).toBeTruthy()
    expect(screen.getByText('• Katalogberuf: Architekt')).toBeTruthy()
    fireEvent.click(screen.getByTestId('profil-art-freiberuf'))
    await waitFor(() => expect(body).toEqual({ confirmedKind: 'freiberuf' }))
  })

  it('looks up the Hebesatz: found, several choices, none', async () => {
    useBusinessDefaults({ ...BASE_PROFILE, confirmedKind: 'gewerbe' })
    const m = (ags: string, name: string) => ({ ags, name, land: 'BY', multiplierPercent: 400 })
    server.use(
      http.get(`${BASE_URL}/gewerbesteuer/hebesatz`, ({ request }) => {
        const gemeinde = new URL(request.url).searchParams.get('gemeinde')
        if (gemeinde === 'Neustadt') return HttpResponse.json({ kind: 'choices', choices: [m('1', 'Neustadt a.d. Donau'), m('2', 'Neustadt b. Coburg')], tableYear: 2025, note: null })
        if (gemeinde === 'Berlin') return HttpResponse.json({ kind: 'found', municipality: { ags: '3', name: 'Berlin', land: 'BE', multiplierPercent: 410 }, tableYear: 2025, note: null })
        return HttpResponse.json({ kind: 'not_found', tableYear: 2025, note: null })
      }),
    )
    renderBusiness('profil')
    const input = await screen.findByTestId('profil-gemeinde-name')
    const search = async (name: string) => {
      fireEvent.change(input, { target: { value: name } })
      fireEvent.click(screen.getByTestId('profil-hebesatz-suchen'))
    }
    await search('Berlin')
    expect((await screen.findByTestId('profil-hebesatz-3')).textContent).toBe('Berlin (BE): 410 % · Tabelle 2025')
    await search('Neustadt')
    expect(await screen.findByTestId('profil-hebesatz-2')).toBeTruthy()
    await search('Nirgendwo')
    expect(await screen.findByTestId('profil-hebesatz-keiner')).toBeTruthy()
  })
})

describe('the book', () => {
  it('lists the entries and reverses one', async () => {
    useBusinessDefaults(BASE_PROFILE, BOOK_WITH_ENTRY)
    let url = ''
    let body: unknown = null
    server.use(
      http.post(`${BASE_URL}/buchungen/1/storno`, async ({ request }) => {
        url = request.url
        body = await request.json()
        return HttpResponse.json({ ...ENTRY, number: 2, reversalOf: 1 }, { status: 201 })
      }),
    )
    renderBusiness('buch')
    const row = await screen.findByTestId('buch-eintrag-1')
    expect(within(row).getByText('1 · Bürobedarf')).toBeTruthy()
    fireEvent.click(screen.getByTestId('buch-storno-1'))
    await waitFor(() => expect(url).not.toBe(''))
    expect(body).toMatchObject({ documentNumber: 'Storno-1' })
  })

  it('shows a broken chain plainly, with the German reason', async () => {
    useBusinessDefaults(BASE_PROFILE, { ...BOOK_WITH_ENTRY, integrity: { ok: false, reason: 'Eintrag 1 passt nicht zum Protokoll.', firstBadSeq: 1 } })
    renderBusiness('buch')
    expect((await screen.findByTestId('buch-integritaet-fehler')).textContent).toContain('Kette des Buchs ist gebrochen')
    expect(screen.getByText('Eintrag 1 passt nicht zum Protokoll.')).toBeTruthy()
  })

  it('shows the 409 BOOK_INTEGRITY_BROKEN of a write as the same plain error', async () => {
    useBusinessDefaults(BASE_PROFILE, BOOK_WITH_ENTRY)
    server.use(http.post(`${BASE_URL}/buchungen/1/storno`, () => HttpResponse.json({ statusCode: 409, code: 'BOOK_INTEGRITY_BROKEN', message: 'Das Buch ist verändert worden.' }, { status: 409 })))
    renderBusiness('buch')
    fireEvent.click(await screen.findByTestId('buch-storno-1'))
    expect(await screen.findByTestId('buch-integritaet-fehler')).toBeTruthy()
    expect(screen.getByText('Das Buch ist verändert worden.')).toBeTruthy()
  })

  it('books a new entry as a draft with the tax key on the taxed line', async () => {
    useBusinessDefaults()
    let body: { lines: { account: string; side: string; amount: number; taxKey?: string }[]; text: string } | null = null
    server.use(
      http.post(`${BASE_URL}/buchungen`, async ({ request }) => {
        body = (await request.json()) as typeof body
        return HttpResponse.json(ENTRY, { status: 201 })
      }),
    )
    renderBusiness('buch')
    fireEvent.click(await screen.findByTestId('buch-neu'))
    fireEvent.change(screen.getByTestId('buch-datum'), { target: { value: '01.03.2025' } })
    fireEvent.change(screen.getByTestId('buch-text'), { target: { value: 'Bürobedarf' } })
    fireEvent.change(screen.getByTestId('buch-belegnummer'), { target: { value: 'RE-1' } })
    fireEvent.change(screen.getByTestId('buch-soll'), { target: { value: '4930' } })
    fireEvent.change(screen.getByTestId('buch-haben'), { target: { value: '1200' } })
    fireEvent.change(screen.getByTestId('buch-betrag'), { target: { value: '120,00' } })
    fireEvent.click(screen.getByTestId('buch-schluessel-vst19'))
    fireEvent.click(screen.getByTestId('buch-buchen'))
    await waitFor(() => expect(body).not.toBeNull())
    expect(body!.lines).toEqual([
      { account: '4930', side: 'debit', amount: 12000, taxKey: 'vst19' },
      { account: '1200', side: 'credit', amount: 12000 },
    ])
  })

  it('asks for what is missing instead of sending', async () => {
    useBusinessDefaults()
    renderBusiness('buch')
    fireEvent.click(await screen.findByTestId('buch-neu'))
    fireEvent.click(screen.getByTestId('buch-buchen'))
    expect(await screen.findByTestId('buch-formular-fehler')).toBeTruthy()
  })
})

describe('the quick entry', () => {
  it('sends the totals in cents and names the profit', async () => {
    server.use(http.get(`${BASE_URL}/abschluss`, () => HttpResponse.json({ mode: 'euer', integrity: { ok: true }, euer: { totals: { einnahmen: 500000, ausgaben: 120000 }, profit: { profitEur: 3800 } }, bilanz: null })))
    let body: unknown = null
    server.use(
      http.post(`${BASE_URL}/schnellerfassung`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json([], { status: 201 })
      }),
    )
    renderBusiness('erfassung')
    expect((await screen.findByTestId('erfassung-gewinn')).textContent).toBe('+3.800,00\u00a0€')
    fireEvent.change(screen.getByTestId('erfassung-einnahmen_umsatzsteuerpflichtig'), { target: { value: '1.234,50' } })
    fireEvent.change(screen.getByTestId('erfassung-ausgaben_kfz'), { target: { value: '80' } })
    fireEvent.click(screen.getByTestId('erfassung-buchen'))
    await waitFor(() => expect(body).not.toBeNull())
    expect(body).toEqual({ totals: [{ key: 'einnahmen_umsatzsteuerpflichtig', amountCents: 123450 }, { key: 'ausgaben_kfz', amountCents: 8000 }] })
  })

  it('says that totals exist for the EÜR only when the books are a Bilanz', async () => {
    server.use(http.get(`${BASE_URL}/abschluss`, () => HttpResponse.json({ mode: 'bilanz', integrity: { ok: true }, euer: null, bilanz: null })))
    renderBusiness('erfassung')
    expect(await screen.findByTestId('erfassung-nur-euer')).toBeTruthy()
    expect(screen.queryByTestId('erfassung-buchen')).toBeNull()
  })
})

describe('the bank', () => {
  const OPEN = (id: string, withSuggestion: boolean) => ({
    id,
    status: 'offen',
    entryNumber: null,
    transaction: { bookingDate: '2025-04-02', amount: -4200, counterpartyName: 'Büro GmbH', reference: 'RE 5' },
    suggestion: withSuggestion ? { ruleId: 'r1', account: '4930', taxKey: 'vst19', text: 'Bürobedarf' } : null,
  })

  it('imports a file with the chosen preset and reports what happened', async () => {
    server.use(http.get(`${BASE_URL}/bank`, () => HttpResponse.json([])))
    let body: { format: string; preset?: string; content: string } | null = null
    server.use(
      http.post(`${BASE_URL}/bank/import`, async ({ request }) => {
        body = (await request.json()) as typeof body
        return HttpResponse.json({ added: 3, duplicates: 1, outsideYear: 0 }, { status: 201 })
      }),
    )
    renderBusiness('bank')
    expect(await screen.findByTestId('bank-import')).toBeTruthy()
    fireEvent.click(screen.getByTestId('bank-quelle-ing'))
    fireEvent.change(screen.getByTestId('bank-datei-input'), { target: { files: [{ text: async () => 'Buchung;Betrag' }] } })
    expect((await screen.findByTestId('bank-ergebnis')).textContent).toBe('3 neu, 1 schon da, 0 außerhalb des Jahres')
    expect(body).toEqual({ format: 'csv', preset: 'ing', content: 'Buchung;Betrag' })
  })

  it('accepts a suggestion with „als Regel merken“ and ignores another', async () => {
    server.use(http.get(`${BASE_URL}/bank`, () => HttpResponse.json([OPEN('u1', true), OPEN('u2', false)])))
    let accepted: unknown = null
    let ignored = false
    server.use(
      http.post(`${BASE_URL}/bank/u1/buchen`, async ({ request }) => {
        accepted = await request.json()
        return HttpResponse.json(ENTRY, { status: 201 })
      }),
      http.post(`${BASE_URL}/bank/u2/ignorieren`, () => {
        ignored = true
        return new HttpResponse(null, { status: 201 })
      }),
    )
    renderBusiness('bank')
    expect((await screen.findByTestId('bank-vorschlag-u1')).textContent).toBe('Konto 4930 · Bürobedarf')
    // Without a suggestion a booking needs an account first.
    expect(screen.getByTestId('bank-buchen-u2').getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(screen.getByTestId('bank-merken-u1'))
    fireEvent.click(screen.getByTestId('bank-buchen-u1'))
    await waitFor(() => expect(accepted).toEqual({ remember: true }))
    fireEvent.click(screen.getByTestId('bank-ignorieren-u2'))
    await waitFor(() => expect(ignored).toBe(true))
  })
})

describe('the assets and the closing', () => {
  it('lists the register with its book values', async () => {
    server.use(http.get(`${BASE_URL}/anlagen`, () => HttpResponse.json({ register: { rows: [{ id: 'a1', label: 'Laptop', acquisitionCost: 120000, closingBookValue: 80000 }], totals: {} }, records: [] })))
    renderBusiness('anlagen')
    expect(await screen.findByTestId('anlage-a1')).toBeTruthy()
    expect(screen.getByText('Laptop')).toBeTruthy()
  })

  it('carries the closing balances into the next year and shows a refusal plainly', async () => {
    server.use(
      http.get(`${BASE_URL}/abschluss`, () => HttpResponse.json({ mode: 'bilanz', integrity: { ok: true }, euer: null, bilanz: { incomeStatement: { profit: 250000 }, balanceSheet: { totalAktiva: 900000, totalPassiva: 900000 } } })),
      http.post(`${BASE_URL}/abschluss/eroeffnung`, () => HttpResponse.json({ statusCode: 409, code: 'OPENING_ENTRY_EXISTS', message: 'Die Eröffnungsbilanz 2026 ist schon gebucht.' }, { status: 409 })),
    )
    renderBusiness('abschluss')
    expect((await screen.findByTestId('abschluss-gewinn')).textContent).toBe('+2.500,00\u00a0€')
    fireEvent.click(screen.getByTestId('abschluss-eroeffnung'))
    expect(await screen.findByText('Die Eröffnungsbilanz 2026 ist schon gebucht.')).toBeTruthy()
  })

  it('shows the broken chain on the closing and blocks the carry-forward', async () => {
    server.use(http.get(`${BASE_URL}/abschluss`, () => HttpResponse.json({ mode: 'bilanz', integrity: { ok: false, reason: 'Kette bei Eintrag 4 unterbrochen.' }, euer: null, bilanz: null })))
    renderBusiness('abschluss')
    expect(await screen.findByTestId('buch-integritaet-fehler')).toBeTruthy()
    expect(screen.getByTestId('abschluss-eroeffnung').getAttribute('aria-disabled')).toBe('true')
  })
})

describe('Umsatzsteuer, Gewerbesteuer and Verluste', () => {
  it('shows the VAT result as Nachzahlung or Erstattung, with plain amounts and no sign', async () => {
    useBusinessDefaults()
    server.use(http.get(`${BASE_URL}/umsatzsteuer`, () => HttpResponse.json({ figures: {}, result: { outputVat: { standard: 1900, reduced: 0, zero: 0 }, inputVatDeductibleEur: 400, vatOfYearEur: 1500, prepaymentsEur: 1000, balanceEur: 500 }, cashAccountingAllowed: true, smallBusiness: SMALL_OK })))
    renderBusiness('umsatzsteuer')
    expect((await screen.findByTestId('ust-saldo')).textContent).toBe('500,00\u00a0€')
    expect(screen.getByText('Nachzahlung')).toBeTruthy()
    expect(screen.getByText('1.000,00 €')).toBeTruthy()
    expect(screen.queryByText(/^\+/)).toBeNull()
  })

  it('shows the Gewerbesteuer calculated, open (Hebesatz missing) and not due', async () => {
    server.use(http.get(`${BASE_URL}/gewerbesteuer`, () => HttpResponse.json({ status: 'entfaellt', reason: 'Freiberufler zahlen keine Gewerbesteuer.' })))
    const first = renderBusiness('gewerbesteuer')
    expect(await screen.findByTestId('gewst-entfaellt')).toBeTruthy()
    first.unmount()
    server.use(http.get(`${BASE_URL}/gewerbesteuer`, () => HttpResponse.json({ status: 'offen', missing: ['hebesatz'] })))
    const second = renderBusiness('gewerbesteuer')
    expect(await screen.findByTestId('gewst-offen')).toBeTruthy()
    second.unmount()
    server.use(http.get(`${BASE_URL}/gewerbesteuer`, () => HttpResponse.json({ status: 'berechnet', profitEur: 82000, result: { additionsEur: 0, deductionsEur: 0, tradeIncomeBeforeLossEur: 72000, lossUsedEur: 10000, lossRemainingEur: 0, roundedTradeIncomeEur: 72000, allowanceEur: 24500, baseAmountEur: 1662, multiplierPercent: 460, tradeTaxEur: 7645.2 }, multiplier: { percent: 460, source: 'tabelle', tableYear: 2025, note: null } })))
    renderBusiness('gewerbesteuer')
    // The chain from the profit to the tax, with the § 10a Fehlbetrag that explains 82.000 → 72.000, all without signs.
    expect((await screen.findByTestId('gewst-steuer')).textContent).toBe('7.645,20\u00a0€')
    expect(screen.getByTestId('gewst-gewinn').textContent).toBe('82.000,00\u00a0€')
    expect(screen.getByTestId('gewst-fehlbetrag').textContent).toBe('10.000,00\u00a0€')
    expect(screen.getByTestId('gewst-gewerbeertrag').textContent).toBe('72.000,00\u00a0€')
  })

  it('offers the carry-back only as a whole: take it or waive it', async () => {
    useBusinessDefaults()
    server.use(http.get(`${BASE_URL}/verluste`, () => HttpResponse.json({ facts: {}, rules: {}, businessProfitEur: -8000, year: { newLossEur: 8000, carryForwardDeductedEur: 0, remainingCarryForwardEur: 8000 }, carryBack: { intoYearBeforeEur: 5000, intoSecondYearBeforeEur: 0, remainingEur: 3000 } })))
    let body: { lossFacts: { waiveCarryBack: boolean } } | null = null
    server.use(
      http.put(BASE_URL, async ({ request }) => {
        body = (await request.json()) as typeof body
        return HttpResponse.json(BASE_PROFILE)
      }),
    )
    renderBusiness('verluste')
    expect(await screen.findByTestId('verluste-ruecktrag')).toBeTruthy()
    fireEvent.click(screen.getByTestId('verluste-ruecktrag-verzicht'))
    await waitFor(() => expect(body?.lossFacts.waiveCarryBack).toBe(true))
  })
})

describe('the ELSTER fill-in help', () => {
  beforeEach(() => useElsterForms())
  const HELP: ElsterHelpDto = {
    form: 'anlage-euer',
    instance: null,
    year: 2025,
    status: 'published',
    note: null,
    sourceUrl: null,
    lineNumbersAvailable: true,
    lines: [
      { id: 'euer.betriebseinnahmen', zeile: '12', kennzahlen: ['111'], label: 'Betriebseinnahmen', column: null, value: 5000 },
      { id: 'euer.offen', zeile: '13', kennzahlen: [], label: 'Ungeklärt', column: null, value: null },
    ],
  }
  const mockForm = (form: string, help: ElsterHelpDto | { status: number }) =>
    server.use(
      http.get(`${BASE_URL}/elster/${form}`, () => {
        if ('lines' in help) return HttpResponse.json(help)
        return HttpResponse.json({ statusCode: help.status, code: 'SELF_EMPLOYMENT_NOT_UNLOCKED', message: 'x' }, { status: help.status })
      }),
    )

  it('shows each line with Zeile and Kennzahl, a copy action, and „nicht ermittelt“ for a null value', async () => {
    mockForm('anlage-euer', HELP)
    const copy = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(globalThis.navigator, 'clipboard', { value: { writeText: copy }, configurable: true })
    renderBusiness('elster')
    const row = await screen.findByTestId('elster-zeile-euer.betriebseinnahmen')
    expect(within(row).getByText('Zeile 12 · Kz 111')).toBeTruthy()
    expect(screen.getByTestId('elster-wert-euer.betriebseinnahmen').textContent).toBe('5.000')
    // Lines without a value do not apply: behind one toggle, „nicht ermittelt“ only inside it.
    expect(screen.queryByTestId('elster-zeile-euer.offen')).toBeNull()
    fireEvent.click(screen.getByTestId('elster-weitere-zeilen'))
    expect(screen.getByTestId('elster-weitere-zeilen').textContent).toBe('Weitere Zeilen (1) – leer lassen')
    expect(screen.getByTestId('elster-wert-euer.offen').textContent).toBe('nicht ermittelt')
    expect(screen.queryByTestId('elster-kopieren-euer.offen')).toBeNull()
    fireEvent.click(screen.getByTestId('elster-kopieren-euer.betriebseinnahmen'))
    expect(copy).toHaveBeenCalledWith('5.000')
  })

  it('shows a form without official line numbers by meaning: „Feld in Mein ELSTER: …“', async () => {
    mockForm('anlage-euer', HELP)
    mockForm('anlage-s', { ...HELP, form: 'anlage-s', lineNumbersAvailable: false, lines: [{ id: 'anlage-s.gewinn', zeile: null, kennzahlen: [], label: 'Gewinn', column: null, value: 42000.5 }] })
    renderBusiness('elster')
    fireEvent.click(await screen.findByTestId('elster-formular-anlage-s'))
    const row = await screen.findByTestId('elster-zeile-anlage-s.gewinn')
    expect(within(row).getByText('Feld in Mein ELSTER: Gewinn')).toBeTruthy()
    expect(screen.getByTestId('elster-nach-bedeutung')).toBeTruthy()
    expect(screen.getByTestId('elster-wert-anlage-s.gewinn').textContent).toBe('42.000,50')
  })

  it('says a form that is not published and guesses no lines', async () => {
    mockForm('anlage-euer', { ...HELP, year: 2026, status: 'not_published', note: 'Das BMF hat es noch nicht veröffentlicht.', lines: [] })
    renderBusiness('elster')
    expect(await screen.findByTestId('elster-nicht-veroeffentlicht')).toBeTruthy()
    expect(screen.getByText('Das BMF hat es noch nicht veröffentlicht.')).toBeTruthy()
  })

  it('leads to the unlock when the year is not paid (402)', async () => {
    mockForm('anlage-euer', { status: 402 })
    const onOpenPage = vi.fn()
    renderBusiness('elster', { onOpenPage })
    fireEvent.click(await screen.findByTestId('elster-freischalten'))
    expect(onOpenPage).toHaveBeenCalledWith('freischalten')
  })
})

describe('the ELSTER fill-in help, by meaning and after the checkout', () => {
  beforeEach(() => useElsterForms())
  const byMeaning = (form: string, status: 'published' | 'not_available') =>
    server.use(
      http.get(`${BASE_URL}/elster/${form}`, () =>
        HttpResponse.json({ form, year: 2025, status, note: `Das Formular ${form} hat keine Zeilennummern.`, sourceUrl: null, lineNumbersAvailable: false, lines: [{ id: `${form}.gewinn`, zeile: null, kennzahlen: [], label: 'Gewinn', value: 42000 }] }),
      ),
    )

  it('renders by-meaning lines of Anlage G even when the status says not_available, and never shows a raw form id', async () => {
    byMeaning('anlage-g', 'not_available')
    server.use(http.get(`${BASE_URL}/elster/anlage-euer`, () => HttpResponse.json({ form: 'anlage-euer', year: 2025, status: 'published', note: null, sourceUrl: null, lineNumbersAvailable: true, lines: [] })))
    renderBusiness('elster')
    fireEvent.click(await screen.findByTestId('elster-formular-anlage-g'))
    const row = await screen.findByTestId('elster-zeile-anlage-g.gewinn')
    expect(within(row).getByText('Feld in Mein ELSTER: Gewinn')).toBeTruthy()
    expect(screen.queryByTestId('elster-nicht-verfuegbar')).toBeNull()
    expect(screen.queryByText(/anlage-g/)).toBeNull()
  })

  it('refetches and says the year is unlocked when it is back from the checkout', async () => {
    let reads = 0
    server.use(http.get(`${BASE_URL}/elster/anlage-euer`, () => { reads += 1; return HttpResponse.json({ form: 'anlage-euer', year: 2025, status: 'published', note: null, sourceUrl: null, lineNumbersAvailable: true, lines: [] }) }))
    renderBusiness('elster', { payment: 'erfolg' })
    expect(await screen.findByTestId('elster-freigeschaltet')).toBeTruthy()
    await waitFor(() => expect(reads).toBeGreaterThanOrEqual(1))
  })
})

describe('the area\'s figures and dates', () => {
  it('shows the year\'s profit as the one number on the overview, a loss as „Verlust“', async () => {
    useBusinessDefaults({ ...BASE_PROFILE, confirmedKind: 'gewerbe' })
    server.use(http.get(`${BASE_URL}/abschluss`, () => HttpResponse.json({ mode: 'euer', integrity: { ok: true }, euer: { totals: { einnahmen: 0, ausgaben: 0 }, profit: { profitEur: 60335.5 } }, bilanz: null })))
    const first = renderBusiness(undefined)
    expect((await screen.findByTestId('business-gewinn')).textContent).toBe('Gewinn 60.335,50\u00a0€')
    first.unmount()
    server.use(http.get(`${BASE_URL}/abschluss`, () => HttpResponse.json({ mode: 'euer', integrity: { ok: true }, euer: { totals: { einnahmen: 0, ausgaben: 0 }, profit: { profitEur: -1200 } }, bilanz: null })))
    renderBusiness(undefined)
    expect((await screen.findByTestId('business-gewinn')).textContent).toBe('Verlust 1.200,00\u00a0€')
  })

  it('writes the dates of the book the German way', async () => {
    useBusinessDefaults(BASE_PROFILE, { ...BOOK_WITH_ENTRY, lockedThrough: '2025-01-31' })
    renderBusiness('buch')
    const row = await screen.findByTestId('buch-eintrag-1')
    expect(within(row).getByText('01.03.2025 · RE-1')).toBeTruthy()
    expect(screen.getByText('Fest bis 31.01.2025')).toBeTruthy()
  })

  it('labels the Verfahrensdokumentation fields in German, not by their keys', async () => {
    server.use(
      http.get(`${BASE_URL}/verfahrensdokumentation`, () => HttpResponse.json({ values: {}, text: '', missing: ['inhaber', 'datensicherung', 'belegablage'] })),
      http.get(`${BASE_URL}/e-bilanz`, () => HttpResponse.json({ xbrl: '', transmitted: false, note: '' })),
    )
    renderBusiness('export')
    await screen.findByTestId('verfahren-inhaber')
    expect(screen.getByText('Inhaber/in')).toBeTruthy()
    expect(screen.getByText('Wie die Daten gesichert werden')).toBeTruthy()
    expect(screen.queryByText('datensicherung')).toBeNull()
  })
})

describe('the export', () => {
  it('downloads the GoBD zip, and shows a broken chain (409) as the plain error', async () => {
    useBusinessDefaults()
    server.use(
      http.get(`${BASE_URL}/verfahrensdokumentation`, () => HttpResponse.json({ values: {}, text: '', missing: ['FIRMA'] })),
      http.get(`${BASE_URL}/e-bilanz`, () => HttpResponse.json({ xbrl: '<x/>', transmitted: false, note: 'Noch nicht übermittelt.' })),
    )
    const create = vi.fn(() => 'blob:x')
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() })
    server.use(http.get(`${BASE_URL}/export/gobd`, () => new HttpResponse(new Blob(['zip']), { status: 200, headers: { 'content-type': 'application/zip', 'content-disposition': 'attachment; filename="datenueberlassung-2025.zip"' } })))
    renderBusiness('export')
    fireEvent.click(await screen.findByTestId('gobd-export'))
    await waitFor(() => expect(create).toHaveBeenCalled())

    server.use(http.get(`${BASE_URL}/export/gobd`, () => HttpResponse.json({ statusCode: 409, code: 'BOOK_INTEGRITY_BROKEN', message: 'Kette bei Eintrag 2 gebrochen.' }, { status: 409 })))
    fireEvent.click(screen.getByTestId('gobd-export'))
    expect(await screen.findByTestId('buch-integritaet-fehler')).toBeTruthy()
    expect(screen.getByText('Kette bei Eintrag 2 gebrochen.')).toBeTruthy()
  })

  it('says plainly that the E-Bilanz is not sent, and asks for a missing procedure placeholder', async () => {
    server.use(
      http.get(`${BASE_URL}/verfahrensdokumentation`, () => HttpResponse.json({ values: {}, text: '', missing: ['FIRMA'] })),
      http.get(`${BASE_URL}/e-bilanz`, () => HttpResponse.json({ xbrl: '<x/>', transmitted: false, note: 'Noch nicht übermittelt.' })),
    )
    renderBusiness('export')
    expect((await screen.findByTestId('ebilanz-nicht-uebermittelt')).textContent).toBe('Wird noch nicht an die Finanzverwaltung gesendet.')
    expect(await screen.findByTestId('verfahren-FIRMA')).toBeTruthy()
  })

  it('leads to the unlock on a 402', async () => {
    server.use(
      http.get(`${BASE_URL}/verfahrensdokumentation`, () => HttpResponse.json({ values: {}, text: '', missing: [] })),
      http.get(`${BASE_URL}/e-bilanz`, () => HttpResponse.json({ xbrl: '', transmitted: false, note: '' })),
      http.get(`${BASE_URL}/export/gobd`, () => HttpResponse.json({ statusCode: 402, code: 'SELF_EMPLOYMENT_NOT_UNLOCKED', message: 'Nicht freigeschaltet.' }, { status: 402 })),
    )
    renderBusiness('export')
    fireEvent.click(await screen.findByTestId('gobd-export'))
    expect(await screen.findByTestId('export-nicht-freigeschaltet')).toBeTruthy()
  })
})

describe('the checkout at the self-employment tier', () => {
  it('names an unconfigured tier (503) instead of failing silently', async () => {
    server.use(http.post(`${BASE_URL}/checkout`, () => HttpResponse.json({ statusCode: 503, code: 'PAYMENT_TIER_NOT_CONFIGURED', message: 'x' }, { status: 503 })))
    renderBusiness('freischalten')
    fireEvent.click(await screen.findByTestId('checkout-selbststaendig'))
    expect(await screen.findByTestId('checkout-nicht-eingerichtet')).toBeTruthy()
  })
})

export { YEAR }

describe('the ELSTER fill-in help over the whole return (ADR-0101 §16)', () => {
  const FORMS = [
    { form: 'anlage-euer', group: 'business' as const, instance: null },
    { form: 'est-1-a', group: 'income-tax' as const, instance: null },
    { form: 'anlage-n', group: 'income-tax' as const, instance: { id: 'A', kind: 'person' as const, person: 'A' as const, name: null, number: 1 } },
    { form: 'anlage-n', group: 'income-tax' as const, instance: { id: 'B', kind: 'person' as const, person: 'B' as const, name: null, number: 2 } },
    { form: 'anlage-v', group: 'income-tax' as const, instance: { id: 'obj-1', kind: 'property' as const, person: null, name: 'Kastanienallee 9', number: 1 } },
    { form: 'anlage-kind', group: 'income-tax' as const, instance: { id: 'kid-1', kind: 'child' as const, person: null, name: 'Lotta', number: 1 } },
    { form: 'anlage-kind', group: 'income-tax' as const, instance: { id: 'kid-2', kind: 'child' as const, person: null, name: null, number: 2 } },
  ]
  const empty = (form: string): ElsterHelpDto => ({ form, instance: null, year: YEAR, status: 'published', note: null, sourceUrl: null, lineNumbersAvailable: true, lines: [] })

  it('lists only the forms with values, business first, each copy named by person, child or property', async () => {
    useElsterForms(FORMS)
    server.use(http.get(`${BASE_URL}/elster/anlage-euer`, () => HttpResponse.json(empty('anlage-euer'))))
    renderBusiness('elster')
    expect((await screen.findByTestId('elster-formular-anlage-euer')).textContent).toBe('✓Anlage EÜR')
    expect(screen.getByTestId('elster-formular-est-1-a').textContent).toBe('ESt 1 A')
    expect(screen.getByTestId('elster-formular-anlage-n-1').textContent).toBe('Anlage N · Ich')
    expect(screen.getByTestId('elster-formular-anlage-n-2').textContent).toBe('Anlage N · Partner')
    expect(screen.getByTestId('elster-formular-anlage-v-1').textContent).toBe('Anlage V · Kastanienallee 9')
    expect(screen.getByTestId('elster-formular-anlage-kind-1').textContent).toBe('Anlage Kind · Lotta')
    expect(screen.getByTestId('elster-formular-anlage-kind-2').textContent).toBe('Anlage Kind · Kind 2')
    // Forms without a value are not offered at all.
    expect(screen.queryByTestId('elster-formular-gewst-1-a')).toBeNull()
    expect(screen.getByText('Betrieb')).toBeTruthy()
    expect(screen.getByText('Einkommensteuererklärung')).toBeTruthy()
  })

  it('reads the chosen copy by its id and shows the column of a shared line', async () => {
    useElsterForms(FORMS)
    let asked: string | null = null
    server.use(
      http.get(`${BASE_URL}/elster/anlage-euer`, () => HttpResponse.json(empty('anlage-euer'))),
      http.get(`${BASE_URL}/elster/anlage-kind`, ({ request }) => {
        asked = new URL(request.url).searchParams.get('instanz')
        return HttpResponse.json({
          ...empty('anlage-kind'),
          instance: FORMS[5]!.instance,
          lines: [{ id: 'anlKind.kz42Von', zeile: '45', kennzahlen: ['42'], label: 'Das Kind war mit mir in der gemeinsamen Wohnung gemeldet im Zeitraum', column: 'vom', value: '01.01.' }],
        })
      }),
    )
    renderBusiness('elster')
    fireEvent.click(await screen.findByTestId('elster-formular-anlage-kind-1'))
    const row = await screen.findByTestId('elster-zeile-anlKind.kz42Von')
    expect(asked).toBe('kid-1')
    expect(within(row).getByText('Zeile 45 · Kz 42')).toBeTruthy()
    expect(within(row).getByText('Spalte: vom')).toBeTruthy()
    expect(screen.getByTestId('elster-wert-anlKind.kz42Von').textContent).toBe('01.01.')
  })

  it('says so when no form has a value yet', async () => {
    useElsterForms([])
    renderBusiness('elster')
    expect(await screen.findByTestId('elster-keine-formulare')).toBeTruthy()
  })

  it('leads to the unlock when the form list answers 402', async () => {
    server.use(http.get(`${BASE_URL}/elster`, () => HttpResponse.json({ statusCode: 402, code: 'SELF_EMPLOYMENT_NOT_UNLOCKED', message: 'x' }, { status: 402 })))
    renderBusiness('elster')
    expect(await screen.findByTestId('elster-freischalten')).toBeTruthy()
  })
})
