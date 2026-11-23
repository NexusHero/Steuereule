import type { AdvisorActionStatus } from './action-status'

/**
 * ADR-0097 — what became of a Beleg. Like the year assignment of ADR-0040, the processing state is never
 * stored: the read stores its facts on the Beleg, the owl drafts carry the Beleg's id, and this module
 * derives the state from both. A stored copy of the state could only drift from the drafts it describes.
 */

/** How the last read of a Beleg ended: values proposed, nothing for the return, or not readable. */
export const RECEIPT_READ_OUTCOMES = ['werte', 'nichts', 'fehler'] as const
export type ReceiptReadOutcome = (typeof RECEIPT_READ_OUTCOMES)[number]

export function isReceiptReadOutcome(value: unknown): value is ReceiptReadOutcome {
  return typeof value === 'string' && (RECEIPT_READ_OUTCOMES as readonly string[]).includes(value)
}

/**
 * Why a read ended without values or failed, as a short code the app turns into its own words.
 * `entwuerfe_fehlen` is never stored: it is derived when a read had values but its drafts are gone.
 */
export const RECEIPT_READ_REASONS = [
  /** Read, but nothing for the tax return recognised. */
  'nichts_erkannt',
  /** An order confirmation or a quote: only the invoice counts. */
  'keine_rechnung',
  /** Recognised, but not deductible (e.g. a cosmetic operation). */
  'nicht_absetzbar',
  /** What it lists is already counted through another document. */
  'schon_gezaehlt',
  /** The same file was uploaded before; its drafts stay with the first one. */
  'dublette',
  /** The document tried to write a protected field; the proposal was blocked. */
  'blockiert',
  /** The document is for a year the app does not keep. */
  'kein_steuerjahr',
  /** It is Person B's document, and B keeps an own account: B uploads it there. */
  'anderes_konto',
  /** The server failed while reading the text. */
  'lesefehler',
  /** The device could not read the file (damaged or encrypted PDF, OCR did not start). */
  'unlesbar',
  /** The device found no text in the file. */
  'kein_text',
  /** A file type the app cannot read. */
  'nicht_unterstuetzt',
  /** Read with values, but the drafts were removed since (their conversation was deleted). */
  'entwuerfe_fehlen',
] as const
export type ReceiptReadReason = (typeof RECEIPT_READ_REASONS)[number]

export function isReceiptReadReason(value: unknown): value is ReceiptReadReason {
  return typeof value === 'string' && (RECEIPT_READ_REASONS as readonly string[]).includes(value)
}

/** The facts the last read wrote on the Beleg. */
export interface ReceiptReadFacts {
  /** ISO timestamp of the last read; null while the Beleg was never read. */
  readonly readAt: string | null
  readonly outcome: ReceiptReadOutcome | null
  readonly reason: ReceiptReadReason | null
  /** The tax year the read staged its drafts in. */
  readonly draftsTaxYear: number | null
}

/** The owl drafts of one Beleg, counted over every tax year. */
export interface ReceiptDraftTally {
  readonly pending: number
  readonly applied: number
  /** Decided without being taken over: dismissed, undone, or superseded by an alternative. */
  readonly dismissed: number
  /** The tax years the drafts sit in, ascending. */
  readonly taxYears: readonly number[]
}

export const NO_RECEIPT_DRAFTS: ReceiptDraftTally = { pending: 0, applied: 0, dismissed: 0, taxYears: [] }

export const RECEIPT_PROCESSING_STATES = ['neu', 'nicht_lesbar', 'vorschlaege', 'uebernommen', 'nichts_verwertbar', 'verworfen'] as const
export type ReceiptProcessingState = (typeof RECEIPT_PROCESSING_STATES)[number]

export interface ReceiptProcessing {
  readonly state: ReceiptProcessingState
  readonly reason: ReceiptReadReason | null
  readonly pending: number
  readonly applied: number
  readonly dismissed: number
  /** The tax year the drafts sit in; the app says „liegt im Steuerjahr …“ when it is not the open one. */
  readonly draftsTaxYear: number | null
  /** Not yet fully processed: the Belege tab counts these as „offen“. */
  readonly open: boolean
}

const OPEN_STATES: ReadonlySet<ReceiptProcessingState> = new Set(['neu', 'nicht_lesbar', 'vorschlaege'])

/** The one rule of ADR-0097 §1. Drafts outrank the read facts: they say what really became of the values. */
export function receiptProcessingFromFacts(read: ReceiptReadFacts, drafts: ReceiptDraftTally): ReceiptProcessing {
  const { state, reason } = stateOf(read, drafts)
  return {
    state,
    reason,
    pending: drafts.pending,
    applied: drafts.applied,
    dismissed: drafts.dismissed,
    draftsTaxYear: read.draftsTaxYear ?? drafts.taxYears.at(-1) ?? null,
    open: OPEN_STATES.has(state),
  }
}

function stateOf(read: ReceiptReadFacts, drafts: ReceiptDraftTally): { state: ReceiptProcessingState; reason: ReceiptReadReason | null } {
  if (drafts.pending > 0) return { state: 'vorschlaege', reason: null }
  if (drafts.applied > 0) return { state: 'uebernommen', reason: null }
  if (drafts.dismissed > 0) return { state: 'verworfen', reason: null }
  switch (read.outcome) {
    case 'fehler':
      return { state: 'nicht_lesbar', reason: read.reason }
    case 'nichts':
      return { state: 'nichts_verwertbar', reason: read.reason ?? 'nichts_erkannt' }
    case 'werte':
      // The values were proposed once, but no draft is left to decide: the Beleg has to be read again.
      return { state: 'neu', reason: 'entwuerfe_fehlen' }
    default:
      return { state: 'neu', reason: null }
  }
}

/** A draft as far as the tally needs it: its Beleg, its status and the year it sits in. */
export interface ReceiptDraftStatus {
  readonly receiptId?: string | null | undefined
  readonly status: AdvisorActionStatus
  readonly taxYear: number
}

/** Counts the drafts per Beleg id; drafts without a Beleg (typed in the chat) are left out. */
export function tallyReceiptDrafts(drafts: readonly ReceiptDraftStatus[]): Map<string, ReceiptDraftTally> {
  const tallies = new Map<string, { pending: number; applied: number; dismissed: number; years: Set<number> }>()
  for (const draft of drafts) {
    if (!draft.receiptId) continue
    const tally = tallies.get(draft.receiptId) ?? { pending: 0, applied: 0, dismissed: 0, years: new Set<number>() }
    if (draft.status === 'pending') tally.pending++
    else if (draft.status === 'applied') tally.applied++
    else tally.dismissed++
    tally.years.add(draft.taxYear)
    tallies.set(draft.receiptId, tally)
  }
  return new Map(
    [...tallies].map(([id, t]) => [id, { pending: t.pending, applied: t.applied, dismissed: t.dismissed, taxYears: [...t.years].sort((a, b) => a - b) }]),
  )
}

/** The tax years the app keeps; the parse endpoint accepts the same span. */
export const FIRST_RECEIPT_TAX_YEAR = 2020
export const LAST_RECEIPT_TAX_YEAR = 2030

/**
 * The one year rule (ADR-0097 §5): a document's drafts go to the year it belongs to, whatever year was
 * open when it was uploaded; nothing blocks. Null when that year is one the app does not keep, so no
 * reader stages a document's values in a year they do not belong to.
 */
export function receiptFilingYear(documentYear: number | null, requestedYear: number): number | null {
  if (documentYear === null) return requestedYear
  return Number.isInteger(documentYear) && documentYear >= FIRST_RECEIPT_TAX_YEAR && documentYear <= LAST_RECEIPT_TAX_YEAR ? documentYear : null
}
