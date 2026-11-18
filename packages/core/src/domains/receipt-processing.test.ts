import { describe, expect, it } from 'vitest'
import {
  NO_RECEIPT_DRAFTS,
  receiptFilingYear,
  receiptProcessingFromFacts,
  tallyReceiptDrafts,
  type ReceiptDraftTally,
  type ReceiptReadFacts,
} from './receipt-processing'

// ADR-0097 — a Beleg says what became of it. The state is never stored: it is derived from the facts of the
// last read and the owl drafts that carry the Beleg's id, like the year assignment of ADR-0040.

const UNREAD: ReceiptReadFacts = { readAt: null, outcome: null, reason: null, draftsTaxYear: null }
const read = (facts: Partial<ReceiptReadFacts>): ReceiptReadFacts => ({ ...UNREAD, readAt: '2026-11-18T10:00:00.000Z', ...facts })
const drafts = (tally: Partial<ReceiptDraftTally>): ReceiptDraftTally => ({ ...NO_RECEIPT_DRAFTS, ...tally })

describe('receiptProcessingFromFacts — the table of ADR-0097 §1', () => {
  it('neu: uploaded, never read — open', () => {
    expect(receiptProcessingFromFacts(UNREAD, NO_RECEIPT_DRAFTS)).toEqual({
      state: 'neu',
      reason: null,
      pending: 0,
      applied: 0,
      dismissed: 0,
      draftsTaxYear: null,
      open: true,
    })
  })

  it('nicht_lesbar: the read failed, with its reason — open, the user has to do something', () => {
    expect(receiptProcessingFromFacts(read({ outcome: 'fehler', reason: 'unlesbar' }), NO_RECEIPT_DRAFTS)).toMatchObject({
      state: 'nicht_lesbar',
      reason: 'unlesbar',
      open: true,
    })
  })

  it('vorschlaege: at least one draft waits — open', () => {
    expect(receiptProcessingFromFacts(read({ outcome: 'werte', draftsTaxYear: 2025 }), drafts({ pending: 1, applied: 1, taxYears: [2025] }))).toMatchObject({
      state: 'vorschlaege',
      pending: 1,
      applied: 1,
      draftsTaxYear: 2025,
      open: true,
    })
  })

  it('uebernommen: every draft decided, at least one taken over — done', () => {
    expect(receiptProcessingFromFacts(read({ outcome: 'werte' }), drafts({ applied: 1, dismissed: 2, taxYears: [2025] }))).toMatchObject({
      state: 'uebernommen',
      open: false,
    })
  })

  it('nichts_verwertbar: read, nothing for the return, with its reason — done', () => {
    expect(receiptProcessingFromFacts(read({ outcome: 'nichts', reason: 'keine_rechnung' }), NO_RECEIPT_DRAFTS)).toMatchObject({
      state: 'nichts_verwertbar',
      reason: 'keine_rechnung',
      open: false,
    })
  })

  it('verworfen: every draft dismissed — done', () => {
    expect(receiptProcessingFromFacts(read({ outcome: 'werte' }), drafts({ dismissed: 3, taxYears: [2025] }))).toMatchObject({
      state: 'verworfen',
      open: false,
    })
  })

  it('drafts outrank the read facts: a Beleg read before this rule existed still gets its state', () => {
    expect(receiptProcessingFromFacts(UNREAD, drafts({ pending: 2, taxYears: [2024] }))).toMatchObject({
      state: 'vorschlaege',
      draftsTaxYear: 2024,
    })
  })

  it('a Beleg read with values whose drafts are gone (the conversation was deleted) is open again, to be read anew', () => {
    expect(receiptProcessingFromFacts(read({ outcome: 'werte', draftsTaxYear: 2025 }), NO_RECEIPT_DRAFTS)).toMatchObject({
      state: 'neu',
      reason: 'entwuerfe_fehlen',
      open: true,
    })
  })

  it('names the tax year of the drafts from the read facts first, else the newest year they sit in', () => {
    expect(receiptProcessingFromFacts(read({ outcome: 'werte', draftsTaxYear: 2024 }), drafts({ pending: 1, taxYears: [2024, 2025] })).draftsTaxYear).toBe(2024)
    expect(receiptProcessingFromFacts(UNREAD, drafts({ pending: 1, taxYears: [2023, 2025] })).draftsTaxYear).toBe(2025)
  })
})

describe('tallyReceiptDrafts — counts per Beleg over every tax year', () => {
  it('counts by status; undone and superseded drafts count as decided without being taken over', () => {
    const tally = tallyReceiptDrafts([
      { receiptId: 'b1', status: 'pending', taxYear: 2025 },
      { receiptId: 'b1', status: 'applied', taxYear: 2025 },
      { receiptId: 'b1', status: 'undone', taxYear: 2024 },
      { receiptId: 'b1', status: 'superseded', taxYear: 2025 },
      { receiptId: 'b2', status: 'dismissed', taxYear: 2025 },
      { status: 'pending', taxYear: 2025 },
    ])
    expect(tally.get('b1')).toEqual({ pending: 1, applied: 1, dismissed: 2, taxYears: [2024, 2025] })
    expect(tally.get('b2')).toEqual({ pending: 0, applied: 0, dismissed: 1, taxYears: [2025] })
    expect(tally.size).toBe(2)
  })
})

describe('receiptFilingYear — one year rule for every reader (ADR-0097 §5)', () => {
  it('files a document in its own year when that is a tax year the app keeps', () => {
    expect(receiptFilingYear(2024, 2025)).toBe(2024)
    expect(receiptFilingYear(2025, 2025)).toBe(2025)
  })

  it('stays in the requested year when the document names none', () => {
    expect(receiptFilingYear(null, 2025)).toBe(2025)
  })

  it('files nowhere when the document is for a year the app does not keep: nothing is staged in a wrong one', () => {
    expect(receiptFilingYear(2012, 2025)).toBeNull()
    expect(receiptFilingYear(2031, 2025)).toBeNull()
  })
})
