import { receiptProcessingFromFacts, tallyReceiptDrafts, type ReceiptProcessing } from '@steuereule/core'
import type { ReceiptDraftRecord } from '../advisor/advisor.repository.js'
import type { ReceiptDuplicateDto, ReceiptFilledFieldDto } from './dto/receipt-response.dto.js'
import type { ReceiptFacts, ReceiptRecord } from './receipt.repository.js'
import type { StoredContentKey } from './storage/storage.port.js'

/**
 * What the Belege inbox derives per Beleg (ADR-0097): its processing state, the fields it filled and the
 * older upload it duplicates. Pure: the facts come from the receipt, its drafts and the content keys.
 */

/** The drafts grouped by the Beleg they came from. */
export function draftsByReceipt(drafts: readonly ReceiptDraftRecord[]): Map<string, ReceiptDraftRecord[]> {
  const grouped = new Map<string, ReceiptDraftRecord[]>()
  for (const draft of drafts) grouped.set(draft.receiptId, [...(grouped.get(draft.receiptId) ?? []), draft])
  return grouped
}

export function processingOf(record: ReceiptFacts, drafts: readonly ReceiptDraftRecord[]): ReceiptProcessing {
  const tally = tallyReceiptDrafts(drafts).get(record.id) ?? { pending: 0, applied: 0, dismissed: 0, taxYears: [] }
  return receiptProcessingFromFacts(
    {
      readAt: record.readAt?.toISOString() ?? null,
      outcome: record.readOutcome ?? null,
      reason: record.readReason ?? null,
      draftsTaxYear: record.draftsTaxYear ?? null,
    },
    tally,
  )
}

/** The fields the Beleg filled: its drafts the user took over and has not undone. */
export function filledFieldsOf(drafts: readonly ReceiptDraftRecord[]): ReceiptFilledFieldDto[] {
  return drafts
    .filter((draft) => draft.status === 'applied')
    .map((draft) => ({
      actionId: draft.actionId,
      taxYear: draft.taxYear,
      screen: draft.screen,
      field: draft.field,
      instance: draft.instance,
      person: draft.person,
      label: draft.label,
      value: draft.newValue,
    }))
}

/**
 * For every Beleg whose file content an older Beleg of the same user already holds: that older one, the
 * first upload. Deleting the first makes the next one the first, so a duplicate never points at nothing.
 * `records` in any order; ties on the upload time keep their order.
 */
export function originalsByContent<T extends Pick<ReceiptRecord, 'id' | 'createdAt'>>(records: readonly T[], keys: readonly StoredContentKey[]): Map<string, T> {
  const keyOf = new Map(keys.map((k) => [k.receiptId, k.contentMac]))
  const firstWithKey = new Map<string, T>()
  const originals = new Map<string, T>()
  const oldestFirst = [...records].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  for (const record of oldestFirst) {
    const key = keyOf.get(record.id)
    if (key === undefined) continue
    const first = firstWithKey.get(key)
    if (first === undefined) firstWithKey.set(key, record)
    else originals.set(record.id, first)
  }
  return originals
}

export function duplicateDto(original: ReceiptRecord | undefined): ReceiptDuplicateDto | null {
  return original === undefined ? null : { id: original.id, fileName: original.fileName, uploadedAt: original.createdAt.toISOString() }
}
