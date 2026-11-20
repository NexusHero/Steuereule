import { describe, expect, it } from 'vitest'
import { accountFor, type AccountConceptId, type BookingTaxKey, type ChartOfAccounts } from './accounts'
import { lockPeriod } from './gobd'
import {
  accountTotals,
  createLedger,
  euerYearOf,
  isBalanced,
  LedgerError,
  postEntry,
  reverseEntry,
  validateDraft,
  vatFromGross,
  type EntryDraft,
  type JournalEntry,
  type Ledger,
} from './journal'

// ADR-0101 §11 — the one book: balanced entries in cents, VAT by tax key, corrections only by Storno.

const n = (chart: ChartOfAccounts, c: AccountConceptId): string => accountFor(chart, c).number

function draft(chart: ChartOfAccounts, overrides: Partial<EntryDraft> = {}): EntryDraft {
  return {
    date: '2025-03-01',
    documentNumber: 'RE-1',
    text: 'Rechnung',
    lines: [
      { account: n(chart, 'bank'), side: 'debit', amount: 11_900 },
      { account: n(chart, 'revenue_19'), side: 'credit', amount: 11_900, taxKey: 'ust19' },
    ],
    ...overrides,
  }
}

function codeOf(fn: () => unknown): string {
  try {
    fn()
  } catch (e) {
    return e instanceof LedgerError ? e.code : 'other'
  }
  return 'none'
}

describe('postEntry', () => {
  it('splits a gross 19 % amount into net and VAT (119,00 → 100,00 + 19,00)', () => {
    const { entry } = postEntry(createLedger('SKR03', 'euer'), draft('SKR03'))
    expect(entry.lines).toEqual([
      { account: '1200', side: 'debit', amount: 11_900, taxKey: 'none', taxPart: null },
      { account: '8400', side: 'credit', amount: 10_000, taxKey: 'ust19', taxPart: 'base' },
      { account: '1776', side: 'credit', amount: 1_900, taxKey: 'ust19', taxPart: 'tax' },
    ])
    expect(entry.number).toBe(1)
  })

  it('adds input and output VAT on the net amount for § 13b and EU acquisitions', () => {
    const ledger = createLedger('SKR04', 'bilanz')
    for (const [concept, key, input, output] of [
      ['services_eu_13b_19', 'rc13b19', '1407', '3837'],
      ['goods_ig_19', 'igErwerb19', '1404', '3804'],
      ['goods_ig_7', 'igErwerb7', '1402', '3802'],
    ] as const) {
      const { entry } = postEntry(ledger, draft('SKR04', {
        lines: [
          { account: n('SKR04', concept), side: 'debit', amount: 20_000, taxKey: key },
          { account: '1800', side: 'credit', amount: 20_000 },
        ],
      }))
      const tax = key === 'igErwerb7' ? 1_400 : 3_800
      expect(entry.lines.filter((l) => l.taxPart === 'tax')).toEqual([
        { account: input, side: 'debit', amount: tax, taxKey: key, taxPart: 'tax' },
        { account: output, side: 'credit', amount: tax, taxKey: key, taxPart: 'tax' },
      ])
      expect(isBalanced(entry)).toBe(true)
    }
  })

  it('takes a net amount when told so', () => {
    const { entry } = postEntry(createLedger('SKR03', 'bilanz'), draft('SKR03', {
      lines: [
        { account: n('SKR03', 'receivables'), side: 'debit', amount: 10_700 },
        { account: n('SKR03', 'revenue_7'), side: 'credit', amount: 10_000, taxKey: 'ust7', amountIs: 'net' },
      ],
    }))
    expect(entry.lines.map((l) => l.amount)).toEqual([10_700, 10_000, 700])
  })

  it('labels zero-rate lines without adding a VAT line', () => {
    const { entry } = postEntry(createLedger('SKR03', 'euer'), draft('SKR03', {
      lines: [
        { account: '1200', side: 'debit', amount: 5_000 },
        { account: n('SKR03', 'revenue_kleinunternehmer'), side: 'credit', amount: 5_000, taxKey: 'kleinunternehmer' },
      ],
    }))
    expect(entry.lines).toHaveLength(2)
    expect(entry.lines[1]).toMatchObject({ taxKey: 'kleinunternehmer', taxPart: 'base' })
  })

  it('rejects what is not a booking, all problems at once', () => {
    const ledger = createLedger('SKR03', 'euer')
    const errors = validateDraft(ledger, { date: '2025-02-30', documentNumber: ' ', text: '', lines: [{ account: '0001', side: 'debit', amount: 1.5 }] })
    expect(errors.map((e) => e.code)).toEqual(['invalid_date', 'missing_document_number', 'too_few_lines', 'invalid_amount', 'unknown_account'])
    expect(codeOf(() => postEntry(ledger, draft('SKR03', { lines: [{ account: '1200', side: 'debit', amount: 100 }, { account: '8400', side: 'credit', amount: 99 }] })))).toBe('unbalanced')
    expect(codeOf(() => postEntry(ledger, draft('SKR03', { regularPayment: { dueDate: 'x', periodYear: 2025 } })))).toBe('invalid_date')
  })

  it('numbers entries without gaps and freezes them', () => {
    let ledger: Ledger = createLedger('SKR03', 'euer')
    for (let i = 0; i < 3; i++) ledger = postEntry(ledger, draft('SKR03', { documentNumber: `RE-${i}` })).ledger
    expect(ledger.entries.map((e) => e.number)).toEqual([1, 2, 3])
    const entry = ledger.entries[0] as unknown as { lines: { amount: number }[] }
    expect(() => { entry.lines[0]!.amount = 1 }).toThrow(TypeError)
    expect(Object.isFrozen(ledger.entries)).toBe(true)
  })

  it('keeps every entry balanced for any gross amount and tax key (invariant)', () => {
    const keys: readonly BookingTaxKey[] = ['none', 'ust19', 'ust7', 'vst19', 'vst7', 'rc13b19', 'igErwerb19', 'igErwerb7', 'steuerfrei']
    let ledger: Ledger = createLedger('SKR04', 'bilanz')
    let seed = 7
    const next = (): number => (seed = (seed * 48_271) % 2_147_483_647)
    for (let i = 0; i < 300; i++) {
      const amount = (next() % 1_000_000) + 1
      const taxKey = keys[next() % keys.length]!
      const out = taxKey.startsWith('v') || taxKey.startsWith('rc') || taxKey.startsWith('ig')
      ledger = postEntry(ledger, draft('SKR04', {
        documentNumber: `B-${i}`,
        lines: out
          ? [{ account: n('SKR04', 'other_operating_expenses'), side: 'debit', amount, taxKey }, { account: '1800', side: 'credit', amount }]
          : [{ account: '1800', side: 'debit', amount }, { account: n('SKR04', 'revenue_19'), side: 'credit', amount, taxKey }],
      })).ledger
    }
    expect(ledger.entries.every(isBalanced)).toBe(true)
  })

  it('rounds VAT from gross to the nearest cent', () => {
    expect(vatFromGross(100, 19)).toBe(16) // 100 × 19/119 = 15,97 → 16
    expect(vatFromGross(1, 7)).toBe(0)
  })
})

describe('reverseEntry (Storno)', () => {
  it('mirrors the original so every account returns to its balance', () => {
    let ledger = postEntry(createLedger('SKR03', 'bilanz'), draft('SKR03')).ledger
    ledger = reverseEntry(ledger, 1, { date: '2025-03-05', documentNumber: 'ST-1' }).ledger
    const storno = ledger.entries[1]!
    expect(storno).toMatchObject({ number: 2, reversalOf: 1, text: 'Storno von Buchung 1: Rechnung' })
    for (const t of accountTotals(ledger.entries).values()) expect(t.debit - t.credit).toBe(0)
    expect(ledger.entries[0]!.lines).toEqual(postEntry(createLedger('SKR03', 'bilanz'), draft('SKR03')).entry.lines)
  })

  it('refuses a second Storno, a Storno of a Storno and unknown entries', () => {
    let ledger = postEntry(createLedger('SKR03', 'bilanz'), draft('SKR03')).ledger
    ledger = reverseEntry(ledger, 1, { date: '2025-03-05', documentNumber: 'ST-1' }).ledger
    expect(codeOf(() => reverseEntry(ledger, 1, { date: '2025-03-06', documentNumber: 'ST-2' }))).toBe('already_reversed')
    expect(codeOf(() => reverseEntry(ledger, 2, { date: '2025-03-06', documentNumber: 'ST-2' }))).toBe('reversal_of_reversal')
    expect(codeOf(() => reverseEntry(ledger, 9, { date: '2025-03-06', documentNumber: 'ST-2' }))).toBe('entry_not_found')
    const fresh = postEntry(createLedger('SKR03', 'bilanz'), draft('SKR03')).ledger
    expect(codeOf(() => reverseEntry(fresh, 1, { date: 'bad', documentNumber: 'ST' }))).toBe('invalid_date')
    expect(codeOf(() => reverseEntry(fresh, 1, { date: '2025-04-01', documentNumber: '' }))).toBe('missing_document_number')
  })

  it('corrects an entry of a festgeschriebener period in an open one, never inside it', () => {
    let ledger = postEntry(createLedger('SKR03', 'bilanz'), draft('SKR03')).ledger
    ledger = lockPeriod(ledger, '2025-03-31')
    expect(codeOf(() => postEntry(ledger, draft('SKR03', { date: '2025-03-31' })))).toBe('period_locked')
    expect(codeOf(() => reverseEntry(ledger, 1, { date: '2025-03-15', documentNumber: 'ST-1' }))).toBe('period_locked')
    expect(reverseEntry(ledger, 1, { date: '2025-04-01', documentNumber: 'ST-1' }).entry.reversalOf).toBe(1)
  })
})

describe('euerYearOf (§ 11 EStG)', () => {
  const entry = (date: string, regularPayment: JournalEntry['regularPayment']): JournalEntry => ({
    number: 1, date, documentNumber: 'x', receiptRef: null, text: '', lines: [], regularPayment, reversalOf: null,
  })

  it('counts the payment day by default', () => {
    expect(euerYearOf(entry('2025-12-30', null))).toBe(2025)
  })

  it('moves a regular payment paid and due within ten days of the turn of the year', () => {
    // January rent paid early on 28.12., due 1.1.: belongs to the new year.
    expect(euerYearOf(entry('2025-12-28', { dueDate: '2026-01-01', periodYear: 2026 }))).toBe(2026)
    // December VAT prepayment paid 8.1., due 10.1.: belongs to the old year.
    expect(euerYearOf(entry('2026-01-08', { dueDate: '2026-01-10', periodYear: 2025 }))).toBe(2025)
    // Edge of the window: 22.12. and 10.1. count.
    expect(euerYearOf(entry('2025-12-22', { dueDate: '2026-01-10', periodYear: 2026 }))).toBe(2026)
  })

  it('does not move it when payment or due date lies outside the window', () => {
    // Due 12.1. (10.1. was a Saturday, § 108 AO): outside, BFH VIII R 25/20.
    expect(euerYearOf(entry('2026-01-08', { dueDate: '2026-01-12', periodYear: 2025 }))).toBe(2026)
    expect(euerYearOf(entry('2026-01-11', { dueDate: '2026-01-10', periodYear: 2025 }))).toBe(2026)
    expect(euerYearOf(entry('2025-12-21', { dueDate: '2026-01-01', periodYear: 2026 }))).toBe(2025)
    // Dates at two different turns of the year, or a period year far off, change nothing.
    expect(euerYearOf(entry('2025-01-05', { dueDate: '2025-12-28', periodYear: 2024 }))).toBe(2025)
    expect(euerYearOf(entry('2025-12-28', { dueDate: '2026-01-01', periodYear: 2020 }))).toBe(2025)
  })
})
