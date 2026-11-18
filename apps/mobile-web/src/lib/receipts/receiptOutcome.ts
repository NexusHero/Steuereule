import type {
  ParseReceiptResponseDto,
  ReceiptFilledFieldDto,
  ReceiptProcessingDtoReason,
  ReceiptProcessingDtoState,
  ReceiptResponseDto,
} from '@steuereule/api-client'
import { formatDraftValue, toGermanDate } from '@steuereule/core'
import type { CaptureFailure } from './captureReceipt'

/**
 * What became of one Beleg (ADR-0097), as every entry point shows it: the Belege tab from `GET /v1/belege`,
 * the chat and the masks from the parse response. Always the server's derived state; only when the server
 * could not record anything (no stored Beleg) is it taken from the response itself.
 */
export interface ReceiptOutcome {
  readonly state: ReceiptProcessingDtoState
  readonly reason: ReceiptProcessingDtoReason
  readonly pending: number
  readonly applied: number
  /** The tax year the drafts sit in; the app says „liegt im Steuerjahr …“ when it is not the open one. */
  readonly draftsTaxYear: number | null
  readonly duplicateOf: { readonly fileName: string; readonly uploadedAt: string } | null
}

export function outcomeOfReceipt(receipt: ReceiptResponseDto): ReceiptOutcome {
  const p = receipt.processing
  return { state: p.state, reason: p.reason, pending: p.pending, applied: p.applied, draftsTaxYear: p.draftsTaxYear, duplicateOf: receipt.duplicateOf }
}

/** The state after one read; the year of this read's drafts wins over the Beleg's older ones. */
export function outcomeOfParse(response: ParseReceiptResponseDto): ReceiptOutcome {
  const draftsTaxYear = response.filedInTaxYear ?? response.draftsTaxYear ?? response.processing?.draftsTaxYear ?? null
  const duplicateOf = response.duplicateOf ?? null
  const p = response.processing
  if (p != null) return { state: p.state, reason: p.reason, pending: p.pending, applied: p.applied, draftsTaxYear, duplicateOf }
  const staged = stagedCount(response)
  return staged > 0
    ? { state: 'vorschlaege', reason: null, pending: staged, applied: 0, draftsTaxYear, duplicateOf }
    : { state: 'nichts_verwertbar', reason: response.noValuesReason ?? (duplicateOf !== null ? 'dublette' : 'nichts_erkannt'), pending: 0, applied: 0, draftsTaxYear: null, duplicateOf }
}

const FAILURE_REASON: Readonly<Record<CaptureFailure, ReceiptProcessingDtoReason>> = {
  unsupported_file: 'nicht_unterstuetzt',
  read_failed: 'unlesbar',
  empty_text: 'kein_text',
  parse_failed: 'lesefehler',
}

/** A file the device or the server could not read: the recorded state, or the failure itself. */
export function outcomeOfFailure(
  failure: CaptureFailure,
  processing?: { readonly state: ReceiptProcessingDtoState; readonly reason: ReceiptProcessingDtoReason; readonly pending: number; readonly applied: number; readonly draftsTaxYear: number | null } | null,
): ReceiptOutcome {
  if (processing != null) return { ...processing, duplicateOf: null }
  return { state: 'nicht_lesbar', reason: FAILURE_REASON[failure], pending: 0, applied: 0, draftsTaxYear: null, duplicateOf: null }
}

/** The year to offer a switch to, or null when the drafts sit in the open year (or there are none). */
export function otherYearOf(outcome: ReceiptOutcome, openYear: number): number | null {
  return outcome.draftsTaxYear !== null && outcome.draftsTaxYear !== openYear ? outcome.draftsTaxYear : null
}

/** A Beleg that can be read again: not read yet, or its read failed. */
export function canReadAgain(outcome: ReceiptOutcome): boolean {
  return outcome.state === 'neu' || outcome.state === 'nicht_lesbar'
}

/** The filled values grouped by tax year, each one as „Spenden 3.135 €“. */
export function filledFieldsByYear(fields: readonly ReceiptFilledFieldDto[]): readonly { readonly taxYear: number; readonly values: readonly string[] }[] {
  const byYear = new Map<number, string[]>()
  for (const f of fields) {
    const list = byYear.get(f.taxYear) ?? []
    list.push(`${f.label} ${formatDraftValue(f.screen, f.field, f.value)}`)
    byYear.set(f.taxYear, list)
  }
  return [...byYear].sort(([a], [b]) => a - b).map(([taxYear, values]) => ({ taxYear, values }))
}

/** „18.11.2026“ from an ISO timestamp, or the text as it came when it is no date. */
export function germanDayOf(isoTimestamp: string): string {
  return toGermanDate(isoTimestamp.slice(0, 10)) ?? isoTimestamp
}

function stagedCount(response: ParseReceiptResponseDto): number {
  const lstbIds = response.lstb?.stagedActionIds.length ?? 0
  if (lstbIds > 0) return lstbIds
  return response.stagedAction != null ? 1 : 0
}
