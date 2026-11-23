import { assignmentFromData, isHolderRef, type AdvisorActionStatus, type ReceiptInboxFacts, type ReceiptInboxItem } from '@steuereule/core'
import type { ReceiptRecord } from '../receipt/receipt.repository.js'

/** The newest Belege the owl is told about; more are counted, not listed. */
export const RECEIPT_INBOX_CAP = 30

/** A draft of the year as far as it matters here: which Beleg it came from and where it stands. */
export interface ReceiptDraftState {
  readonly receiptId?: string | undefined
  readonly status: AdvisorActionStatus
}

function itemOf(record: ReceiptRecord, taxYear: number, drafts: readonly ReceiptDraftState[]): ReceiptInboxItem | null {
  const assignment = assignmentFromData({
    taxYear: record.taxYear,
    belegdatum: record.belegdatum ?? record.receiptDate ?? null,
    zahlungsdatum: record.zahlungsdatum ?? record.paymentDate ?? null,
    proposalDismissed: record.proposalDismissed,
  } as Parameters<typeof assignmentFromData>[0])
  const year = assignment.kind === 'zugeordnet' ? assignment.taxYear : assignment.kind === 'konflikt' ? assignment.assigned : assignment.kind === 'vorgeschlagen' ? assignment.proposal.taxYear : null
  const proposalYear = assignment.kind === 'konflikt' ? assignment.proposal.taxYear : null
  // A Beleg belongs to the year it is assigned or suggested for; one without any year may still be for this one.
  if (year !== null && year !== taxYear && proposalYear !== taxYear) return null
  const own = drafts.filter((draft) => draft.receiptId === record.id)
  const holderRef = record.holderTaxYear === taxYear ? record.holders?.[0] : undefined
  return {
    kind: record.kind ?? record.receiptType ?? null,
    belegdatum: record.belegdatum ?? record.receiptDate ?? null,
    zahlungsdatum: record.zahlungsdatum ?? record.paymentDate ?? null,
    assignment: assignment.kind,
    year,
    holder: holderRef === undefined || !isHolderRef(holderRef) ? null : holderRef === 'A' || holderRef === 'B' ? holderRef : 'kind',
    values: own.some((draft) => draft.status === 'applied') ? 'uebernommen' : own.some((draft) => draft.status === 'pending') ? 'entwurf-offen' : 'keine',
  }
}

/**
 * What the owl may know about the stored Belege of a year (newest first, `records` as the repository returns
 * them): the fields of `ReceiptInboxItem` and nothing else. The file name is deliberately never read here.
 */
export function buildReceiptInbox(records: readonly ReceiptRecord[], taxYear: number, drafts: readonly ReceiptDraftState[], cap = RECEIPT_INBOX_CAP): ReceiptInboxFacts {
  const relevant = records.flatMap((record) => {
    const item = itemOf(record, taxYear, drafts)
    return item === null ? [] : [item]
  })
  return { items: relevant.slice(0, cap), total: relevant.length, truncated: relevant.length > cap }
}
