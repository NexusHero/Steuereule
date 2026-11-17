import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import {
  getAdvisorControllerGetSessionQueryKey,
  getCockpitControllerGetCockpitSummaryQueryKey,
  getConfirmationControllerGetQueryKey,
  getLstbControllerGetLstbQueryKey,
  getReceiptControllerListQueryKey,
  getTaxEstimateControllerGetQueryKey,
  useAdvisorControllerDismissAction,
  useAdvisorControllerGetSession,
  useLstbScanControllerConfirmScan,
  type LstbYearConflictDto,
} from '@steuereule/api-client'
import { APP_NS } from '../../../i18n/resources'
import type { AssignmentQuestionDto } from '@steuereule/api-client'
import { printedPersonDetails } from '@steuereule/core'
import { captureReceipt, type CapturePhase } from '../../../lib/receipts/captureReceipt'
import { createHolderFromDocument, detailsFromDocument, takeNameIntoProfile, type NewHolderDetails } from '../../../lib/receipts/documentAssignment'
import { wholeEurosFrom } from '../../shared/wholeEuros'
import {
  buildFieldDraft,
  evaluateStagedDraft,
  rehydrateDraftFromAdvisorMessages,
  type FieldId,
  type StagedDraftEvaluation,
  type StagedLstbScanDraft,
} from './lstbScanDraft'

export interface LstbScanState {
  readonly stagedScan: StagedLstbScanDraft | null
  readonly evaluation: StagedDraftEvaluation
  readonly canApply: boolean
  readonly busyPhase: CapturePhase | null
  readonly error: string | null
  readonly yearConflict: LstbYearConflictDto | null
  readonly overwriteConflict: boolean
  readonly confirming: boolean
  readonly previewOpen: boolean
  readonly scanFile: (file: File) => Promise<void>
  readonly updateFieldText: (fieldId: FieldId, nextText: string) => void
  readonly confirmField: (fieldId: FieldId) => void
  readonly discardDraft: () => Promise<void>
  readonly applyDraft: (overwriteExisting: boolean, addToExisting?: boolean) => Promise<void>
  /** The scanned certificate is the one already saved for the year. */
  readonly sameCertificate: boolean
  readonly dismissYearConflict: () => void
  readonly dismissOverwriteConflict: () => void
  readonly setPreviewOpen: (open: boolean) => void
  /** The name on the document contradicts this mask, names nobody of the household, or A has no name yet (ADR-0092). */
  readonly assignmentQuestion: { readonly question: AssignmentQuestionDto; readonly printed: NewHolderDetails } | null
  readonly assignmentError: string | null
  /** The user gave the document to someone else than this mask's person: its values wait in the owl. */
  readonly assignedElsewhere: string | null
  readonly chooseHolder: (holder: string) => Promise<void>
  readonly createHolder: (role: 'B' | 'kind', details: NewHolderDetails) => Promise<void>
  readonly confirmSelf: (takeName: boolean) => Promise<void>
}

/**
 * Scan & pre-fill of the LStB mask (#444): capture through the shared receipt pipeline, keep the
 * staged draft (reload-proof via the advisor messages), and take it over atomically on
 * „Werte übernehmen“. Nothing is written before that (Zero-Write, AC 5).
 */
export function useLstbScan({ taxYear, person }: { readonly taxYear: number; readonly person: 'A' | 'B' }): LstbScanState {
  const { t: tr } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const params = person === 'B' ? ({ person: 'B' } as const) : undefined
  const confirmScan = useLstbScanControllerConfirmScan()
  const dismissAction = useAdvisorControllerDismissAction()
  const advisorSessionQuery = useAdvisorControllerGetSession(taxYear, undefined, { query: { retry: false } })

  const [stagedScan, setStagedScan] = useState<StagedLstbScanDraft | null>(null)
  const [locallyDismissed, setLocallyDismissed] = useState(false)
  const [busyPhase, setBusyPhase] = useState<CapturePhase | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [yearConflict, setYearConflict] = useState<LstbYearConflictDto | null>(null)
  const [overwriteConflict, setOverwriteConflict] = useState(false)
  const [sameCertificate, setSameCertificate] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [assignment, setAssignment] = useState<{ question: AssignmentQuestionDto; printed: NewHolderDetails; file: File; receiptId: string | null } | null>(null)
  const [assignmentError, setAssignmentError] = useState<string | null>(null)
  const [assignedElsewhere, setAssignedElsewhere] = useState<string | null>(null)

  // A different tax year or person starts from a clean slate.
  useEffect(() => {
    setStagedScan(null)
    setLocallyDismissed(false)
    setError(null)
    setYearConflict(null)
    setOverwriteConflict(false)
    setPreviewOpen(false)
  }, [taxYear, person])

  // Rehydrate a pending staged scan across reloads without touching LStB storage.
  useEffect(() => {
    if (stagedScan !== null || locallyDismissed) return
    if (advisorSessionQuery.data?.status !== 200) return
    const rehydrated = rehydrateDraftFromAdvisorMessages(advisorSessionQuery.data.data.messages, person)
    if (rehydrated !== null) setStagedScan(rehydrated)
  }, [advisorSessionQuery.data, person, locallyDismissed, stagedScan])

  async function scanFile(file: File, again?: { holder: string; receiptId: string | null }) {
    setError(null)
    setYearConflict(null)
    setOverwriteConflict(false)
    setLocallyDismissed(false)
    setAssignment(null)
    setAssignmentError(null)
    setAssignedElsewhere(null)
    try {
      // The mask is the upload area (ADR-0092): the document is this person's unless its name says otherwise.
      const captured = await captureReceipt(file, {
        taxYear,
        kind: 'lstb',
        onPhase: setBusyPhase,
        ...(again ? { holder: again.holder, receiptId: again.receiptId } : { area: person }),
      })
      // The original lands in the Belege inbox even when reading or parsing fails.
      void queryClient.invalidateQueries({ queryKey: getReceiptControllerListQueryKey() })
      if (!captured.ok) {
        setError(
          tr(
            captured.failure === 'unsupported_file'
              ? 'lstb.scan.error.unsupportedFile'
              : captured.failure === 'read_failed'
                ? 'lstb.scan.error.readFailed'
                : captured.failure === 'empty_text'
                  ? 'lstb.scan.error.emptyOcr'
                  : 'lstb.scan.error.parseFailed',
          ),
        )
        return
      }
      const question = captured.response.assignment?.question ?? null
      if (question !== null) {
        setAssignment({
          question,
          printed: detailsFromDocument(printedPersonDetails('lstb', captured.rawText, question.printedName)),
          file,
          receiptId: captured.receiptId,
        })
        return
      }
      const lstbScan = captured.response.lstb
      if (lstbScan && lstbScan.person !== null && lstbScan.person !== person) {
        // Read for the other spouse: the drafts wait in the owl, not in this mask.
        setAssignedElsewhere(captured.response.assignment?.holder?.name ?? lstbScan.person)
        void queryClient.invalidateQueries({ queryKey: getAdvisorControllerGetSessionQueryKey(taxYear) })
        return
      }
      if (!lstbScan) {
        setError(tr('lstb.scan.error.parseFailed'))
        return
      }
      if (lstbScan.yearConflict !== null) {
        // Year mismatch: nothing was staged; offer the switch instead (ADR-0008, AC 7).
        setStagedScan(null)
        setYearConflict(lstbScan.yearConflict)
        return
      }
      setStagedScan({
        stage: lstbScan.stage,
        receiptId: lstbScan.receiptId ?? captured.receiptId,
        fileName: file.name,
        taxYearOnDocument: lstbScan.taxYearOnDocument,
        actionIds: lstbScan.stagedActionIds,
        fields: {
          bruttoarbeitslohn: buildFieldDraft(lstbScan.fields.bruttoarbeitslohn),
          lohnsteuer: buildFieldDraft(lstbScan.fields.lohnsteuer),
          sozialversicherung: buildFieldDraft(lstbScan.fields.sozialversicherung),
        },
      })
      void queryClient.invalidateQueries({ queryKey: getAdvisorControllerGetSessionQueryKey(taxYear) })
    } catch {
      setError(tr('lstb.scan.error.parseFailed'))
    } finally {
      setBusyPhase(null)
    }
  }

  function updateFieldText(fieldId: FieldId, nextText: string) {
    setStagedScan((prev) =>
      prev === null
        ? null
        : {
            ...prev,
            fields: {
              ...prev.fields,
              [fieldId]: { ...prev.fields[fieldId], text: nextText, confirmed: wholeEurosFrom(nextText) !== null },
            },
          },
    )
  }

  function confirmField(fieldId: FieldId) {
    setStagedScan((prev) =>
      prev === null ? null : { ...prev, fields: { ...prev.fields, [fieldId]: { ...prev.fields[fieldId], confirmed: true } } },
    )
  }

  async function discardDraft() {
    if (stagedScan === null) return
    const actionIds = [...stagedScan.actionIds]
    setLocallyDismissed(true)
    setStagedScan(null)
    setOverwriteConflict(false)
    for (const actionId of actionIds) {
      await dismissAction.mutateAsync({ jahr: taxYear, actionId }).catch(() => {})
    }
    void queryClient.invalidateQueries({ queryKey: getAdvisorControllerGetSessionQueryKey(taxYear) })
  }

  async function applyDraft(overwriteExisting: boolean, addToExisting = false) {
    if (stagedScan === null) return
    const { bruttoarbeitslohn, lohnsteuer, sozialversicherung } = evaluateStagedDraft(stagedScan).values
    if (bruttoarbeitslohn === null || lohnsteuer === null || !evaluateStagedDraft(stagedScan).readyToApply) return

    setError(null)
    try {
      const res = await confirmScan.mutateAsync({
        jahr: taxYear,
        ...(params ? { params } : {}),
        data: {
          bruttoarbeitslohn,
          lohnsteuer,
          ...(sozialversicherung !== null ? { sozialversicherung } : {}),
          ...(stagedScan.receiptId !== null ? { receiptId: stagedScan.receiptId } : {}),
          ...(stagedScan.actionIds.length > 0 ? { actionIds: [...stagedScan.actionIds] } : {}),
          ...(overwriteExisting ? { overwriteExisting: true } : {}),
          ...(addToExisting ? { addToExisting: true } : {}),
        },
      })
      if (res.status === 200) {
        setLocallyDismissed(true)
        setStagedScan(null)
        setOverwriteConflict(false)
        setSameCertificate(false)
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getLstbControllerGetLstbQueryKey(taxYear, params) }),
          queryClient.invalidateQueries({ queryKey: getCockpitControllerGetCockpitSummaryQueryKey(taxYear) }),
          queryClient.invalidateQueries({ queryKey: getTaxEstimateControllerGetQueryKey(taxYear) }),
          queryClient.invalidateQueries({ queryKey: getConfirmationControllerGetQueryKey(taxYear) }),
          queryClient.invalidateQueries({ queryKey: getReceiptControllerListQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getAdvisorControllerGetSessionQueryKey(taxYear) }),
        ])
        return
      }
      if ((res.status as number) === 409) {
        if ((res.data as { code?: string } | undefined)?.code === 'LSTB_SAME_CERTIFICATE') {
          setSameCertificate(true)
          return
        }
        // Existing values: a visible choice, never a silent overwrite (ADR-0008, AC 8).
        setOverwriteConflict(true)
        return
      }
      setError(tr('lstb.scan.error.confirmFailed'))
    } catch {
      setError(tr('lstb.scan.error.confirmFailed'))
    }
  }

  async function chooseHolder(holder: string) {
    if (assignment === null) return
    await scanFile(assignment.file, { holder, receiptId: assignment.receiptId })
  }

  async function createHolder(role: 'B' | 'kind', details: NewHolderDetails) {
    if (assignment === null) return
    const holder = await createHolderFromDocument(taxYear, role, details)
    if (holder === null) {
      setAssignmentError(tr('belegZuordnung.anlegen.fehler'))
      return
    }
    await queryClient.invalidateQueries()
    await scanFile(assignment.file, { holder, receiptId: assignment.receiptId })
  }

  async function confirmSelf(takeName: boolean) {
    if (assignment === null) return
    if (takeName) await takeNameIntoProfile(assignment.printed)
    await scanFile(assignment.file, { holder: 'A', receiptId: assignment.receiptId })
  }

  const evaluation = evaluateStagedDraft(stagedScan)
  return {
    assignmentQuestion: assignment === null ? null : { question: assignment.question, printed: assignment.printed },
    assignmentError,
    assignedElsewhere,
    chooseHolder,
    createHolder,
    confirmSelf,
    stagedScan,
    evaluation,
    canApply:
      stagedScan !== null &&
      evaluation.readyToApply &&
      !evaluation.hasUnconfirmedYellow &&
      !evaluation.hasWiderspruch &&
      !confirmScan.isPending,
    busyPhase,
    error,
    yearConflict,
    overwriteConflict,
    sameCertificate,
    confirming: confirmScan.isPending,
    previewOpen,
    scanFile,
    updateFieldText,
    confirmField,
    discardDraft,
    applyDraft,
    dismissYearConflict: () => setYearConflict(null),
    dismissOverwriteConflict: () => setOverwriteConflict(false),
    setPreviewOpen,
  }
}
