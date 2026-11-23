import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { printedPersonDetails, type DetectedDocumentKind } from '@steuereule/core'
import {
  getAdvisorControllerGetSessionQueryKey,
  getOwlModeControllerGetCardsQueryKey,
  getReceiptControllerListQueryKey,
  receiptParseControllerParseReceipt,
  type ParseReceiptResponseDto,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { captureReceipt, type CapturePhase, type CaptureResult } from '../../lib/receipts/captureReceipt'
import { outcomeOfFailure, outcomeOfParse } from '../../lib/receipts/receiptOutcome'
import { createHolderFromDocument, detailsFromDocument, takeNameIntoProfile, type NewHolderDetails } from '../../lib/receipts/documentAssignment'
import type { ChatReceiptResult, CopilotBridgeContextValue, ParseReceiptInput } from './CopilotBridge.types'
import { upsertReceiptResult } from './CopilotBridgeHelpers'

export interface UseCopilotBridgeReceiptsInput {
  readonly taxYear: number
  readonly isAuthenticated: boolean
  /** Errors outside an answer belong to the conversation that is open. */
  readonly setOpenChatError: (update: string | null) => void
}

/** Receipts read from the chat: parsing, capture, one line per file, and „Für wen?“ (ADR-0092). */
export function useCopilotBridgeReceipts({ taxYear, isAuthenticated, setOpenChatError }: UseCopilotBridgeReceiptsInput) {
  const queryClient = useQueryClient()
  const { t: tr } = useTranslation(APP_NS)
  const [parsingReceipt, setParsingReceipt] = useState(false)
  const [lastParsedReceipt, setLastParsedReceipt] = useState<ParseReceiptResponseDto | null>(null)
  const [receiptPhase, setReceiptPhase] = useState<CapturePhase | null>(null)
  const [receiptNotice, setReceiptNotice] = useState<string | null>(null)
  const [receiptResults, setReceiptResults] = useState<readonly ChatReceiptResult[]>([])
  /** A file's line is replaced when it is read again (after „Für wen?“), never added twice. */
  const putReceiptResult = useCallback((next: ChatReceiptResult) => {
    setReceiptResults((prev) => upsertReceiptResult(prev, next))
  }, [])
  // The document of the last upload, kept in memory to read it again for the person the user names.
  const [assignmentFile, setAssignmentFile] = useState<{ file: File; receiptId: string | null; kind: DetectedDocumentKind; rawText: string } | null>(null)
  const [documentQuestion, setDocumentQuestion] = useState<CopilotBridgeContextValue['documentQuestion']>(null)
  const [documentHolder, setDocumentHolder] = useState<CopilotBridgeContextValue['documentHolder']>(null)
  const [assignmentBusy, setAssignmentBusy] = useState(false)
  const [assignmentError, setAssignmentError] = useState<string | null>(null)
  const [receiptLinkedActionIds, setReceiptLinkedActionIds] = useState<ReadonlySet<string>>(() => new Set())

  const parseReceipt = useCallback(
    async (input: ParseReceiptInput): Promise<ParseReceiptResponseDto | null> => {
      if (!isAuthenticated) return null
      setParsingReceipt(true)
      setOpenChatError(null)
      try {
        const res = await receiptParseControllerParseReceipt({
          taxYear,
          fileName: input.fileName,
          ...(input.rawText !== undefined ? { rawText: input.rawText } : {}),
          ...(input.mimeType !== undefined ? { mimeType: input.mimeType } : {}),
          stageDraft: input.stageDraft ?? true,
        })
        if (res.status === 200) {
          setLastParsedReceipt(res.data)
          const stagedId = res.data.stagedAction?.actionId
          if (stagedId) {
            setReceiptLinkedActionIds((prev) => {
              const next = new Set(prev)
              next.add(stagedId)
              return next
            })
          }
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: getAdvisorControllerGetSessionQueryKey(taxYear) }),
            queryClient.invalidateQueries({ queryKey: getOwlModeControllerGetCardsQueryKey(taxYear) }),
          ])
          return res.data
        }
        setOpenChatError(`Belegprüfung fehlgeschlagen (HTTP ${res.status}).`)
        return null
      } catch (error) {
        setOpenChatError(error instanceof Error ? error.message : 'Belegprüfung fehlgeschlagen.')
        return null
      } finally {
        setParsingReceipt(false)
      }
    },
    [isAuthenticated, queryClient, taxYear],
  )

  const captureReceiptFile = useCallback(
    async (
      file: File,
      again?: { holder: string; receiptId: string | null; kind: DetectedDocumentKind; alsoFor?: boolean },
      storedReceiptId?: string,
    ): Promise<CaptureResult | null> => {
      if (!isAuthenticated) return null
      setParsingReceipt(true)
      setOpenChatError(null)
      setReceiptNotice(null)
      setDocumentQuestion(null)
      setAssignmentError(null)
      if (!again) setDocumentHolder(null)
      try {
        const result = await captureReceipt(file, {
          taxYear,
          // The chat of a year is the entry context: what is uploaded here is filed in that year.
          inChat: true,
          onPhase: setReceiptPhase,
          ...(again ? { kind: again.kind, holder: again.holder, receiptId: again.receiptId, alsoFor: again.alsoFor === true } : {}),
          ...(!again && storedReceiptId !== undefined ? { receiptId: storedReceiptId } : {}),
        })
        if (!result.ok) {
          // The device or the server could not read it: the file's line says so, from the state the server recorded.
          putReceiptResult({ key: result.receiptId ?? again?.receiptId ?? storedReceiptId ?? file.name, fileName: file.name, outcome: outcomeOfFailure(result.failure, result.processing), asking: false })
          return result
        }
        putReceiptResult({
          key: result.receiptId ?? file.name,
          fileName: file.name,
          outcome: outcomeOfParse(result.response),
          asking: result.response.assignment?.question != null,
        })
        setLastParsedReceipt(result.response)
        setAssignmentFile({ file, receiptId: result.receiptId, kind: result.kind, rawText: result.rawText })
        // „Für wen?“ (ADR-0092): nothing was read for anyone; the user answers first.
        const assignment = result.response.assignment ?? null
        if (assignment?.question) {
          setDocumentQuestion({
            question: assignment.question,
            printed: detailsFromDocument(printedPersonDetails(result.kind, result.rawText, assignment.question.printedName)),
          })
        } else if (assignment?.holder) {
          setDocumentHolder({ holder: assignment.holder, alsoFor: assignment.alsoFor })
        }
        const certificate = result.response.chLohnausweis ?? result.response.chLetter ?? null
        const owned = certificate ?? result.response.lstb ?? null
        const isLstb = certificate === null && result.response.lstb != null
        if (owned?.personNotRecordable) {
          setReceiptNotice(tr(isLstb ? 'advisor.chat.lstbPersonBOwnAccount' : 'advisor.chat.certificatePersonBOwnAccount'))
        }
        // A receipt that is read but records nothing (a cosmetic operation, an invoice counted already) says why.
        if (result.response.stagedAction == null && result.response.parsed.vendorCategory === 'krankheitskosten') {
          setReceiptNotice(result.response.parsed.summary)
        }
        // A health statement says in its own words what it holds; „nothing recognised“ and „another
        // tax year“ are said by the file's line, from the server's state (ADR-0097 §3, §5).
        if (result.kind === 'chKrankenkasse' && result.response.stagedAction == null && result.response.assignment?.question == null) {
          setReceiptNotice(result.response.parsed.summary)
        }
        const stagedId = result.response.stagedAction?.actionId
        if (stagedId) {
          setReceiptLinkedActionIds((prev) => new Set(prev).add(stagedId))
        }
        const filedIn = result.response.filedInTaxYear ?? null
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getAdvisorControllerGetSessionQueryKey(taxYear) }),
          queryClient.invalidateQueries({ queryKey: getOwlModeControllerGetCardsQueryKey(taxYear) }),
          ...(filedIn !== null ? [queryClient.invalidateQueries({ queryKey: getAdvisorControllerGetSessionQueryKey(filedIn) })] : []),
          queryClient.invalidateQueries({ queryKey: getReceiptControllerListQueryKey() }),
        ])
        return result
      } catch {
        // Never leave the chat silent: any unexpected failure becomes the file's line.
        putReceiptResult({ key: again?.receiptId ?? storedReceiptId ?? file.name, fileName: file.name, outcome: outcomeOfFailure('parse_failed'), asking: false })
        return null
      } finally {
        setParsingReceipt(false)
        setReceiptPhase(null)
      }
    },
    [isAuthenticated, putReceiptResult, queryClient, taxYear, tr],
  )

  const readStoredReceipt = useCallback(
    (file: File, receiptId: string) => captureReceiptFile(file, undefined, receiptId),
    [captureReceiptFile],
  )

  const readAgainFor = useCallback(
    async (holder: string, alsoFor = false) => {
      if (assignmentFile === null) return
      setAssignmentBusy(true)
      try {
        await captureReceiptFile(assignmentFile.file, { holder, receiptId: assignmentFile.receiptId, kind: assignmentFile.kind, alsoFor })
      } finally {
        setAssignmentBusy(false)
      }
    },
    [assignmentFile, captureReceiptFile],
  )

  const chooseDocumentHolder = useCallback((holder: string) => readAgainFor(holder), [readAgainFor])
  const takeDocumentAlsoFor = useCallback((holder: string) => readAgainFor(holder, true), [readAgainFor])

  const confirmDocumentSelf = useCallback(
    async (takeName: boolean) => {
      if (takeName && documentQuestion !== null) await takeNameIntoProfile(documentQuestion.printed)
      await readAgainFor('A')
    },
    [documentQuestion, readAgainFor],
  )

  const createDocumentHolder = useCallback(
    async (role: 'B' | 'kind', details: NewHolderDetails) => {
      setAssignmentBusy(true)
      setAssignmentError(null)
      const holder = await createHolderFromDocument(taxYear, role, details)
      setAssignmentBusy(false)
      if (holder === null) {
        setAssignmentError(tr('belegZuordnung.anlegen.fehler'))
        return
      }
      await queryClient.invalidateQueries()
      await readAgainFor(holder)
    },
    [queryClient, readAgainFor, taxYear, tr],
  )

  return {
    parsingReceipt,
    lastParsedReceipt,
    receiptPhase,
    receiptNotice,
    setReceiptNotice,
    receiptResults,
    setReceiptResults,
    documentQuestion,
    documentHolder,
    assignmentBusy,
    assignmentError,
    receiptLinkedActionIds,
    parseReceipt,
    captureReceiptFile,
    readStoredReceipt,
    chooseDocumentHolder,
    takeDocumentAlsoFor,
    confirmDocumentSelf,
    createDocumentHolder,
  }
}
