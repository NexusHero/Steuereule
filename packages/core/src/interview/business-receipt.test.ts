import { describe, expect, it } from 'vitest'
import { checkBookingDraft } from './booking-draft'
import { bookingDraftFromReceipt, readBusinessReceipt } from './business-receipt'

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
