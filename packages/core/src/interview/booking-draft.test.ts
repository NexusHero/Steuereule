import { describe, expect, it } from 'vitest'
import { checkBookingDraft, parseBookingDraft, serializeBookingDraft, type BookingDraft } from './booking-draft'

const BOOK = { chart: 'SKR03', mode: 'euer', year: 2025, lockedThrough: null, smallBusiness: false } as const

const laptop: BookingDraft = {
  date: '2025-03-14',
  documentNumber: 'R-2025-031',
  text: 'Notebook für das Büro',
  lines: [
    { account: '0420', side: 'debit', amount: 119_000, taxKey: 'vst19' },
    { account: '1200', side: 'credit', amount: 119_000 },
  ],
  asset: { label: 'Notebook', category: 'computer', method: 'linear', usefulLifeYears: 1 },
}

describe('parseBookingDraft', () => {
  it('reads what serializeBookingDraft wrote', () => {
    const parsed = parseBookingDraft(serializeBookingDraft(laptop))
    expect(parsed).toEqual({ ok: true, draft: laptop })
  })

  it.each([
    ['not JSON', '{oops'],
    ['no lines', JSON.stringify({ date: '2025-01-01', documentNumber: '1', text: 'x' })],
    ['a fractional amount', JSON.stringify({ date: '2025-01-01', documentNumber: '1', text: 'x', lines: [{ account: '1200', side: 'debit', amount: 1.5 }, { account: '8400', side: 'credit', amount: 1.5 }] })],
    ['an unknown side', JSON.stringify({ date: '2025-01-01', documentNumber: '1', text: 'x', lines: [{ account: '1200', side: 'links', amount: 1 }, { account: '8400', side: 'credit', amount: 1 }] })],
    ['an unknown tax key', JSON.stringify({ date: '2025-01-01', documentNumber: '1', text: 'x', lines: [{ account: '1200', side: 'debit', amount: 1, taxKey: 'ust16' }, { account: '8400', side: 'credit', amount: 1 }] })],
    ['a regular payment for the other year (§ 11 ten-day rule)', JSON.stringify({ date: '2025-01-05', documentNumber: '1', text: 'Miete Dezember', regularPayment: { dueDate: '2025-01-01', periodYear: 2024 }, lines: [{ account: '4210', side: 'debit', amount: 100 }, { account: '1200', side: 'credit', amount: 100 }] })],
  ])('refuses %s', (_label, raw) => {
    expect(parseBookingDraft(raw).ok).toBe(false)
  })
})

describe('checkBookingDraft (the core check before a draft exists)', () => {
  it('accepts a balanced draft on accounts of the chart', () => {
    expect(checkBookingDraft(laptop, BOOK)).toEqual({ ok: true })
  })

  it('refuses an account the chart does not have', () => {
    const result = checkBookingDraft({ ...laptop, lines: [{ ...laptop.lines[0]!, account: '9999' }, laptop.lines[1]!] }, BOOK)
    expect(result).toMatchObject({ ok: false, code: 'unknown_account' })
  })

  it('refuses unbalanced amounts', () => {
    const result = checkBookingDraft({ ...laptop, lines: [laptop.lines[0]!, { ...laptop.lines[1]!, amount: 100 }] }, BOOK)
    expect(result).toMatchObject({ ok: false, code: 'unbalanced' })
  })

  it('refuses a date outside the book’s year', () => {
    expect(checkBookingDraft({ ...laptop, date: '2024-12-30' }, BOOK)).toMatchObject({ ok: false, code: 'wrong_year' })
  })

  it('refuses a year the app does not offer', () => {
    expect(checkBookingDraft({ ...laptop, date: '2021-03-01' }, { ...BOOK, year: 2021 })).toMatchObject({ ok: false, code: 'year_not_offered' })
  })

  it('refuses a locked period', () => {
    expect(checkBookingDraft(laptop, { ...BOOK, lockedThrough: '2025-03-31' })).toMatchObject({ ok: false, code: 'period_locked' })
  })

  it('a Kleinunternehmer books no input or output VAT', () => {
    expect(checkBookingDraft(laptop, { ...BOOK, smallBusiness: true })).toMatchObject({ ok: false, code: 'tax_key_not_allowed' })
  })
})
