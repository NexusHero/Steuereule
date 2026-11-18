import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import {
  getAdvisorControllerGetSessionQueryKey,
  getOwlModeControllerGetCardsQueryKey,
  getReceiptControllerListQueryKey,
  type AssignmentQuestionDto,
  type ParseReceiptResponseDto,
} from '@steuereule/api-client'
import { printedPersonDetails, type DetectedDocumentKind } from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'
import { captureReceipt, type CapturePhase, type CaptureReceiptOptions, type CaptureResult } from './captureReceipt'
import { createHolderFromDocument, detailsFromDocument, takeNameIntoProfile, type NewHolderDetails } from './documentAssignment'
import { outcomeOfFailure, outcomeOfParse, type ReceiptOutcome } from './receiptOutcome'

/** What one read of one Beleg left: its progress, its outcome, or the question whose it is (ADR-0092). */
export interface ReceiptReadEntry {
  readonly phase: CapturePhase | null
  readonly outcome: ReceiptOutcome | null
  readonly response: ParseReceiptResponseDto | null
  readonly question: { readonly question: AssignmentQuestionDto; readonly printed: NewHolderDetails } | null
  readonly error: string | null
}

/** What the entry point tells the pipeline about itself (ADR-0097 §4); the reading decides the rest. */
export type ReceiptReadContext = Pick<CaptureReceiptOptions, 'kind' | 'expectedKind' | 'mask' | 'area' | 'person'>

export interface ReceiptReader {
  readonly entries: Readonly<Record<string, ReceiptReadEntry>>
  /** Reads a file (stored first unless `receiptId` says it already is) and stages its drafts. */
  readonly read: (key: string, file: File, receiptId?: string | null) => Promise<CaptureResult>
  readonly choose: (key: string, holder: string) => Promise<void>
  readonly create: (key: string, role: 'B' | 'kind', details: NewHolderDetails) => Promise<void>
  readonly confirmSelf: (key: string, takeName: boolean) => Promise<void>
}

const IDLE: ReceiptReadEntry = { phase: null, outcome: null, response: null, question: null, error: null }

/**
 * The one upload pipeline of ADR-0097 §4 for a screen: store, read on the device, parse with the entry's
 * context, ask „Für wen?“ when the document says so, and keep the outcome per Beleg, so a question or a
 * result is never lost when the next file is read.
 */
export function useReceiptReader({ taxYear, context = {} }: { readonly taxYear: number; readonly context?: ReceiptReadContext }): ReceiptReader {
  const { t: tr } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const [entries, setEntries] = useState<Readonly<Record<string, ReceiptReadEntry>>>({})
  const files = useRef(new Map<string, { file: File; receiptId: string | null; kind: DetectedDocumentKind; printed: NewHolderDetails | null }>())
  const contextRef = useRef(context)
  contextRef.current = context

  const patch = useCallback((key: string, next: Partial<ReceiptReadEntry>) => {
    setEntries((prev) => ({ ...prev, [key]: { ...(prev[key] ?? IDLE), ...next } }))
  }, [])

  const run = useCallback(
    async (key: string, file: File, receiptId: string | null | undefined, again?: { holder: string; kind: DetectedDocumentKind }): Promise<CaptureResult> => {
      patch(key, { phase: 'parsing', error: null, question: null })
      const ctx = contextRef.current
      const result: CaptureResult = await captureReceipt(file, {
        taxYear,
        stageDraft: true,
        onPhase: (phase) => patch(key, { phase }),
        ...(receiptId !== undefined ? { receiptId } : {}),
        ...(ctx.expectedKind !== undefined ? { expectedKind: ctx.expectedKind } : {}),
        ...(ctx.mask !== undefined ? { mask: ctx.mask } : {}),
        ...(ctx.person !== undefined ? { person: ctx.person } : {}),
        ...(again ? { kind: again.kind, holder: again.holder } : { ...(ctx.kind !== undefined ? { kind: ctx.kind } : {}), ...(ctx.area !== undefined ? { area: ctx.area } : {}) }),
      }).catch((): CaptureResult => ({ ok: false, failure: 'parse_failed', receiptId: receiptId ?? null, processing: null }))
      if (!result.ok) {
        patch(key, { phase: null, outcome: outcomeOfFailure(result.failure, result.processing), response: null })
      } else {
        const question = result.response.assignment?.question ?? null
        const printed = question === null ? null : detailsFromDocument(printedPersonDetails(result.kind, result.rawText, question.printedName))
        files.current.set(key, { file, receiptId: result.receiptId, kind: result.kind, printed })
        patch(key, {
          phase: null,
          outcome: outcomeOfParse(result.response),
          response: result.response,
          question: question !== null && printed !== null ? { question, printed } : null,
        })
      }
      const years = new Set([taxYear, ...(result.ok && result.response.filedInTaxYear != null ? [result.response.filedInTaxYear] : [])])
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getReceiptControllerListQueryKey() }),
        ...[...years].flatMap((year) => [
          queryClient.invalidateQueries({ queryKey: getAdvisorControllerGetSessionQueryKey(year) }),
          queryClient.invalidateQueries({ queryKey: getOwlModeControllerGetCardsQueryKey(year) }),
        ]),
      ])
      return result
    },
    [patch, queryClient, taxYear],
  )

  const read = useCallback((key: string, file: File, receiptId?: string | null) => run(key, file, receiptId), [run])

  const choose = useCallback(
    async (key: string, holder: string) => {
      const stored = files.current.get(key)
      if (stored === undefined) return
      await run(key, stored.file, stored.receiptId, { holder, kind: stored.kind })
    },
    [run],
  )

  const create = useCallback(
    async (key: string, role: 'B' | 'kind', details: NewHolderDetails) => {
      const stored = files.current.get(key)
      if (stored === undefined) return
      const holder = await createHolderFromDocument(taxYear, role, details)
      if (holder === null) {
        patch(key, { error: tr('belegZuordnung.anlegen.fehler') })
        return
      }
      await queryClient.invalidateQueries()
      await run(key, stored.file, stored.receiptId, { holder, kind: stored.kind })
    },
    [patch, queryClient, run, taxYear, tr],
  )

  const confirmSelf = useCallback(
    async (key: string, takeName: boolean) => {
      const stored = files.current.get(key)
      if (stored === undefined) return
      if (takeName && stored.printed !== null) await takeNameIntoProfile(stored.printed)
      await run(key, stored.file, stored.receiptId, { holder: 'A', kind: stored.kind })
    },
    [run],
  )

  return { entries, read, choose, create, confirmSelf }
}
