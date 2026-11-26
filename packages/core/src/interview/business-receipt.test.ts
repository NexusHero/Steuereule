import { describe, expect, it } from 'vitest'
import { checkBookingDraft } from './booking-draft'
import { accountFor } from '../domains/ledger/accounts'
import { bookingDraftFromReceipt, readBusinessReceipt, type BusinessReceiptRead } from './business-receipt'

const NOTEBOOK = `Beispiel IT GmbH
Rechnung Nr. RE-2025-0042
Rechnungsdatum: 14.03.2025
Notebook ProBook 14
Netto 1.000,00 EUR
USt 19 % 190,00 EUR
Gesamtbetrag 1.190,00 EUR`

const PAPER = `Schreibwaren Muster
Quittung
05.03.2025
Büropapier und Toner
Summe 59,50 €
inkl. 19% MwSt`

const BOOK = { chart: 'SKR03', mode: 'euer', year: 2025, lockedThrough: null, smallBusiness: false } as const

describe('business receipt → booking draft (ADR-0101 §6, §18)', () => {
  it('reads total, rate, date and number', () => {
    expect(readBusinessReceipt(NOTEBOOK)).toMatchObject({ grossCents: 119_000, vatRate: 19, date: '2025-03-14', invoiceNumber: 'RE-2025-0042' })
  })

  it('an asset over 800 € net becomes a linear asset by the AfA table; the draft passes the book check', () => {
    const result = bookingDraftFromReceipt(readBusinessReceipt(NOTEBOOK), { chart: 'SKR03', smallBusiness: false, year: 2025, direction: 'ausgabe', receiptRef: 'beleg-1' })
    if (!result.ok) throw new Error(result.reason)
    expect(result.draft.asset).toMatchObject({ method: 'linear', category: 'computer', usefulLifeYears: 1 })
    expect(result.draft.lines[0]).toMatchObject({ account: '0420', side: 'debit', amount: 119_000, taxKey: 'vst19' })
    expect(checkBookingDraft(result.draft, BOOK)).toEqual({ ok: true })
  })

  it('office supplies go to their account with the input VAT', () => {
    const result = bookingDraftFromReceipt(readBusinessReceipt(PAPER), { chart: 'SKR04', smallBusiness: false, year: 2025, direction: 'ausgabe' })
    if (!result.ok) throw new Error(result.reason)
    expect(result.draft.asset).toBeUndefined()
    expect(result.draft.lines[0]?.taxKey).toBe('vst19')
    expect(checkBookingDraft(result.draft, { ...BOOK, chart: 'SKR04' })).toEqual({ ok: true })
  })

  it('a Kleinunternehmer books without input VAT; income without output VAT', () => {
    const expense = bookingDraftFromReceipt(readBusinessReceipt(PAPER), { chart: 'SKR03', smallBusiness: true, year: 2025, direction: 'ausgabe' })
    const income = bookingDraftFromReceipt(readBusinessReceipt(PAPER), { chart: 'SKR03', smallBusiness: true, year: 2025, direction: 'einnahme' })
    if (!expense.ok || !income.ok) throw new Error('expected drafts')
    expect(checkBookingDraft(expense.draft, { ...BOOK, smallBusiness: true })).toEqual({ ok: true })
    expect(income.draft.lines[1]).toMatchObject({ account: '8195', taxKey: 'kleinunternehmer' })
  })

  it('no readable total, no draft', () => {
    expect(bookingDraftFromReceipt(readBusinessReceipt('Danke für Ihren Einkauf'), { chart: 'SKR03', smallBusiness: false, year: 2025, direction: 'ausgabe' })).toMatchObject({ ok: false })
  })
})

describe('reading receipt text stays linear (Sonar S8786)', () => {
  it('reads grouped and plain amounts as before', () => {
    // A Netto line is never the total; plain „Gesamt“ and „Brutto“ are (common on till receipts).
    expect(readBusinessReceipt('Rechnung Nr. R-2025/17\nNetto 1.234,56 €\n19 % USt').grossCents).toBeNull()
    expect(readBusinessReceipt('Gesamt 1.234,56 €\nMwSt 19%').grossCents).toBe(123456)
    expect(readBusinessReceipt('Brutto 99,00\n19,00 %').grossCents).toBe(9900)
    expect(readBusinessReceipt('Summe 1 234,56 EUR').grossCents).toBe(123456)
    expect(readBusinessReceipt('Beleg-Nr: B12\nSumme 1234,56').grossCents).toBe(123456)
    expect(readBusinessReceipt('Invoice no. INV9\nTotal 12.34').grossCents).toBe(1234)
  })

  it('does not stall on long hostile input', () => {
    const hostile = `${'1 '.repeat(20_000)}x ${'Rechnungsnr'.repeat(2_000)} ${'19 '.repeat(20_000)}`
    const started = Date.now()
    readBusinessReceipt(hostile)
    expect(Date.now() - started).toBeLessThan(500)
  })
})

describe('reading what a receipt states', () => {
  it('reads the VAT rate: 19 %, 7 %, none stated, and the Kleinunternehmer notices as 0', () => {
    expect(readBusinessReceipt('Gesamt 10,70 €\n7 % MwSt').vatRate).toBe(7)
    expect(readBusinessReceipt('Gesamt 10,00 €').vatRate).toBeNull()
    expect(readBusinessReceipt('Gesamt 10,00 €\nGemäß § 19 UStG wird keine Umsatzsteuer berechnet.').vatRate).toBe(0)
    expect(readBusinessReceipt('Gesamt 10,00 €\nRechnung ohne Ausweis der Umsatzsteuer').vatRate).toBe(0)
  })

  it('reads a two-digit year, an unlabelled date, and refuses a date that does not exist', () => {
    expect(readBusinessReceipt('Datum: 5.3.25\nGesamt 10,00 €').date).toBe('2025-03-05')
    expect(readBusinessReceipt('Gesamt 10,00 €\nAusgestellt am 31.12.2024').date).toBe('2024-12-31')
    expect(readBusinessReceipt('Rechnungsdatum: 31.02.2025\nGesamt 10,00 €').date).toBeNull()
    expect(readBusinessReceipt('Gesamt 10,00 €').date).toBeNull()
  })

  it('has no invoice number when the receipt names none', () => {
    expect(readBusinessReceipt('Gesamt 10,00 €').invoiceNumber).toBeNull()
  })

  it('takes the last labelled amount of a line and ignores a zero total', () => {
    expect(readBusinessReceipt('Summe 10,00 € Skonto 9,50 €').grossCents).toBe(950)
    expect(readBusinessReceipt('Gesamtbetrag 0,00 €').grossCents).toBeNull()
    expect(readBusinessReceipt('Rabatt gesamt 5,00 €\nRechnungsbetrag 20,00 €').grossCents).toBe(2000)
  })

  it('describes the receipt by the item that names an asset, else by a known expense, else by the first text line', () => {
    expect(readBusinessReceipt('Muster Handel\nLaptop Pro 15\nGesamt 900,00 €').description).toBe('Laptop Pro 15')
    expect(readBusinessReceipt('Muster Handel\nFachbuch Steuerrecht\nGesamt 30,00 €').description).toBe('Fachbuch Steuerrecht')
    expect(readBusinessReceipt('Muster Handel\nBeratungsleistung März\nGesamt 30,00 €').description).toBe('Muster Handel')
    expect(readBusinessReceipt('Gesamt 30,00 €').description).toBe('Beleg')
  })

  it('cuts a very long description to 80 characters', () => {
    const long = `Laptop ${'x'.repeat(200)}`
    expect(readBusinessReceipt(`${long}\nGesamt 900,00 €`).description).toHaveLength(80)
  })

  it('falls back to the text reading when the XML of an E-Rechnung cannot be parsed', () => {
    expect(readBusinessReceipt('<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">\nGesamt 12,00 €\n').grossCents).toBe(1200)
  })
})

describe('the booking draft of a receipt', () => {
  const read = (over: Partial<BusinessReceiptRead> = {}): BusinessReceiptRead => ({
    grossCents: 11_900,
    vatRate: 19,
    date: '2025-06-10',
    invoiceNumber: 'R-1',
    description: 'Beratung',
    ...over,
  })
  const ctx = { chart: 'SKR03', smallBusiness: false, year: 2025, direction: 'ausgabe' } as const
  const draftOf = (r: BusinessReceiptRead, c: Parameters<typeof bookingDraftFromReceipt>[1] = ctx) => {
    const result = bookingDraftFromReceipt(r, c)
    if (!result.ok) throw new Error(result.reason)
    return result
  }
  const account = (concept: Parameters<typeof accountFor>[1]) => accountFor('SKR03', concept).number

  it('refuses a zero or negative total', () => {
    expect(bookingDraftFromReceipt(read({ grossCents: 0 }), ctx)).toEqual({ ok: false, reason: 'Auf dem Beleg steht kein lesbarer Gesamtbetrag.' })
    expect(bookingDraftFromReceipt(read({ grossCents: -5 }), ctx)).toMatchObject({ ok: false })
  })

  it('books on the receipt date within the year, and without a note', () => {
    const { draft, notes } = draftOf(read())
    expect(draft.date).toBe('2025-06-10')
    expect(draft.documentNumber).toBe('R-1')
    expect(notes).toEqual(['Das Konto ist ein Vorschlag (sonstige betriebliche Aufwendungen); bitte prüfen.'])
  })

  it('books at year end and says so when the date is unreadable or lies in another year', () => {
    const none = draftOf(read({ date: null, invoiceNumber: null }))
    expect(none.draft.date).toBe('2025-12-31')
    expect(none.draft.documentNumber).toBe('Beleg-2025-12-31')
    expect(none.notes).toContain('Das Belegdatum war nicht lesbar; bitte das Zahlungsdatum eintragen.')
    const other = draftOf(read({ date: '2024-12-30' }))
    expect(other.draft.date).toBe('2025-12-31')
    expect(other.notes).toContain('Der Beleg ist vom 2024-12-30, gebucht wird im Buch 2025; bitte das Zahlungsdatum prüfen.')
  })

  it('carries the receipt reference only when there is one', () => {
    expect(draftOf(read(), { ...ctx, receiptRef: 'beleg-9' }).draft.receiptRef).toBe('beleg-9')
    expect(draftOf(read()).draft.receiptRef).toBeUndefined()
  })

  it('assumes 19 % and says so when no rate is readable, but not for a Kleinunternehmer', () => {
    const open = draftOf(read({ vatRate: null }))
    expect(open.draft.lines[0]).toMatchObject({ taxKey: 'vst19' })
    expect(open.notes).toContain('Der Steuersatz war nicht lesbar; angenommen sind 19 %.')
    expect(draftOf(read({ vatRate: null }), { ...ctx, smallBusiness: true }).notes).not.toContain('Der Steuersatz war nicht lesbar; angenommen sind 19 %.')
  })

  it('takes the input VAT by the stated rate: 7 %, and none for 0 %', () => {
    expect(draftOf(read({ vatRate: 7 })).draft.lines[0]).toMatchObject({ taxKey: 'vst7', amount: 11_900 })
    expect(draftOf(read({ vatRate: 0 })).draft.lines[0]).toMatchObject({ taxKey: 'none', amount: 11_900 })
  })

  it('credits income by its rate: 19 %, 7 %, and a Kleinunternehmer without VAT', () => {
    const income = { ...ctx, direction: 'einnahme' } as const
    const bank = account('bank')
    expect(draftOf(read(), income).draft.lines).toEqual([
      { account: bank, side: 'debit', amount: 11_900 },
      { account: account('revenue_19'), side: 'credit', amount: 11_900, taxKey: 'ust19' },
    ])
    expect(draftOf(read({ vatRate: 7 }), income).draft.lines[1]).toMatchObject({ account: account('revenue_7'), taxKey: 'ust7' })
    expect(draftOf(read(), { ...income, smallBusiness: true }).draft.lines[1]).toMatchObject({ account: account('revenue_kleinunternehmer'), taxKey: 'kleinunternehmer' })
  })

  it('books a small asset up to 250 € net as an expense, a GWG up to 800 € net, and more as a linear asset', () => {
    // 119,00 € gross = 100,00 € net: at or below 250 € net it is an immediate expense
    const small = draftOf(read({ description: 'Monitor 24 Zoll' }))
    expect(small.draft.asset).toBeUndefined()
    expect(small.draft.lines[0]?.account).toBe(account('other_operating_expenses'))
    // 595,00 € gross = 500,00 € net
    const gwg = draftOf(read({ description: 'Monitor 27 Zoll', grossCents: 59_500 }))
    expect(gwg.draft.asset).toEqual({ label: 'Monitor 27 Zoll', method: 'gwg', category: 'computer' })
    expect(gwg.draft.lines[0]?.account).toBe(account('gwg'))
    expect(gwg.notes).toContain('Geringwertiges Wirtschaftsgut: im Jahr der Anschaffung voll abgeschrieben (§ 6 Abs. 2 EStG).')
    // 1.190,00 € gross = 1.000,00 € net, above the 800 € GWG limit
    const linear = draftOf(read({ description: 'Software-Lizenz Buchhaltung', grossCents: 119_000 }))
    expect(linear.draft.asset).toMatchObject({ method: 'linear', category: 'software', usefulLifeYears: 1 })
    expect(linear.draft.lines[0]?.account).toBe(account('software'))
  })

  it('reaches the GWG limit at exactly 800 € net and the expense limit at exactly 250 € net', () => {
    // 952,00 € gross = 800,00 € net: still a GWG
    expect(draftOf(read({ description: 'Notebook', grossCents: 95_200 })).draft.asset?.method).toBe('gwg')
    // 297,50 € gross = 250,00 € net: still an expense
    expect(draftOf(read({ description: 'Notebook', grossCents: 29_750 })).draft.asset).toBeUndefined()
  })

  it('does not split the net of a receipt without VAT', () => {
    // 900 € without VAT is 900 € net: above the GWG limit
    expect(draftOf(read({ description: 'Notebook', grossCents: 90_000, vatRate: 0 })).draft.asset?.method).toBe('linear')
  })

  it.each([
    ['Büropapier und Toner', 'office_supplies'],
    ['Mobilfunk Tarif Mai', 'phone'],
    ['Fachbuch Steuerrecht', 'literature'],
  ] as const)('proposes the account of „%s“ without a note about a guess', (description, concept) => {
    const { draft, notes } = draftOf(read({ description }))
    expect(draft.lines[0]?.account).toBe(account(concept))
    expect(notes).toEqual([])
  })

  it('sets the bank against the expense and balances the lines', () => {
    const { draft } = draftOf(read())
    expect(draft.lines[1]).toEqual({ account: account('bank'), side: 'credit', amount: 11_900 })
  })
})
