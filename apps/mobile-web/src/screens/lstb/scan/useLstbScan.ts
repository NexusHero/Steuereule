import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import {
  getAdvisorControllerGetSessionQueryKey,
  getCockpitControllerGetCockpitSummaryQueryKey,
  getConfirmationControllerGetQueryKey,
  getLstbControllerGetChurchTaxQueryKey,
  getLstbControllerGetEmployerQueryKey,
  getLstbControllerGetLinesQueryKey,
  getLstbControllerGetLstbQueryKey,
  getLstbControllerGetSubsidiesQueryKey,
  getReceiptControllerListQueryKey,
  getTaxEstimateControllerGetQueryKey,
  useAdvisorControllerDismissAction,
  useAdvisorControllerGetSession,
  useLstbScanControllerConfirmScan,
} from '@steuereule/api-client'
import { APP_NS } from '../../../i18n/resources'
import { classifyApiFailure, useApiFailureMessage } from '../../../net/apiFailure'
import type { AssignmentQuestionDto } from '@steuereule/api-client'
import { printedPersonDetails, receiptFilingYear } from '@steuereule/core'
import { captureReceipt, type CapturePhase } from '../../../lib/receipts/captureReceipt'
import { createHolderFromDocument, detailsFromDocument, takeNameIntoProfile, type NewHolderDetails } from '../../../lib/receipts/documentAssignment'
import { wholeEurosFrom } from '../../shared/wholeEuros'
import {
  buildEmployerDraft,
  buildFieldDraft,
  buildLineDrafts,
  evaluateStagedDraft,
  rehydrateDraftFromAdvisorMessages,
  type FieldId,
  type LineId,
  type StagedDraftEvaluation,
  type StagedLstbScanDraft,
} from './lstbScanDraft'

/**
 * The certificate belongs to another tax year (ADR-0097 §5): its drafts were filed there (`staged`), or,
 * read once already, wait to be read there. Nothing blocks; the mask offers the switch.
 */
export interface LstbOtherYear {
  readonly documentYear: number
  readonly activeYear: number
  readonly staged: boolean
}

export interface LstbScanState {
  readonly stagedScan: StagedLstbScanDraft | null
  readonly evaluation: StagedDraftEvaluation
  readonly canApply: boolean
  readonly busyPhase: CapturePhase | null
  readonly error: string | null
  readonly yearConflict: LstbOtherYear | null
  readonly overwriteConflict: boolean
  readonly confirming: boolean
  readonly previewOpen: boolean
  readonly scanFile: (file: File) => Promise<void>
  readonly updateFieldText: (fieldId: FieldId, nextText: string) => void
  readonly confirmField: (fieldId: FieldId) => void
  /** A further line of the draft (Soli, church tax, Zeilen 22–27, Zeile 24). */
  readonly updateLineText: (line: LineId, nextText: string) => void
  readonly confirmLine: (line: LineId) => void
  readonly updateEmployerText: (nextText: string) => void
  readonly confirmEmployer: () => void
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
  const failureMessage = useApiFailureMessage()
  const queryClient = useQueryClient()
  const params = person === 'B' ? ({ person: 'B' } as const) : undefined
  const confirmScan = useLstbScanControllerConfirmScan()
  const dismissAction = useAdvisorControllerDismissAction()
  const advisorSessionQuery = useAdvisorControllerGetSession(taxYear, undefined, { query: { retry: false } })

  const [stagedScan, setStagedScan] = useState<StagedLstbScanDraft | null>(null)
  const [locallyDismissed, setLocallyDismissed] = useState(false)
  const [busyPhase, setBusyPhase] = useState<CapturePhase | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [yearConflict, setYearConflict] = useState<LstbOtherYear | null>(null)
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
    const session = advisorSessionQuery.data?.data
    if (session === undefined) return
    const rehydrated = rehydrateDraftFromAdvisorMessages(session.messages, person)
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
        mask: 'lstb',
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
      // One year rule (ADR-0097 §5): a certificate of another year is filed in that year, not blocked.
      // Its drafts wait there, so this mask offers the switch instead of a draft it could not take over.
      const filedIn = captured.response.filedInTaxYear ?? null
      if (filedIn !== null || lstbScan.yearConflict !== null) {
        setStagedScan(null)
        const documentYear = filedIn ?? lstbScan.yearConflict?.documentYear ?? taxYear
        if (filedIn === null && receiptFilingYear(documentYear, taxYear) === null) {
          setError(tr('lstb.scan.error.noTaxYear', { jahr: documentYear }))
          return
        }
        setYearConflict({ documentYear, activeYear: taxYear, staged: filedIn !== null })
        if (filedIn !== null) void queryClient.invalidateQueries({ queryKey: getAdvisorControllerGetSessionQueryKey(filedIn) })
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
        lines: buildLineDrafts(lstbScan.lines),
        employer: buildEmployerDraft(lstbScan.employer),
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

  function updateLineText(line: LineId, nextText: string) {
    setStagedScan((prev) => {
      const current = prev?.lines[line]
      if (prev === null || current === undefined) return prev
      // Typing a value is confirming it, as for the three fields.
      return { ...prev, lines: { ...prev.lines, [line]: { ...current, text: nextText, confirmed: nextText.trim() !== '' } } }
    })
  }

  function confirmLine(line: LineId) {
    setStagedScan((prev) => {
      const current = prev?.lines[line]
      if (prev === null || current === undefined) return prev
      return { ...prev, lines: { ...prev.lines, [line]: { ...current, confirmed: true } } }
    })
  }

  function updateEmployerText(nextText: string) {
    setStagedScan((prev) => (prev === null || prev.employer === null ? prev : { ...prev, employer: { ...prev.employer, text: nextText, confirmed: true } }))
  }

  function confirmEmployer() {
    setStagedScan((prev) => (prev === null || prev.employer === null ? prev : { ...prev, employer: { ...prev.employer, confirmed: true } }))
  }

  async function discardDraft() {
    if (stagedScan === null) return
    const actionIds = [...stagedScan.actionIds]
    setLocallyDismissed(true)
    setStagedScan(null)
    setOverwriteConflict(false)
    let failure: unknown = null
    for (const actionId of actionIds) {
      await dismissAction.mutateAsync({ jahr: taxYear, actionId }).catch((error: unknown) => {
        failure = error
      })
    }
    // The draft is gone here; a dismissal the server did not take would bring it back on reload — say so.
    if (failure !== null) setError(failureMessage(failure))
    void queryClient.invalidateQueries({ queryKey: getAdvisorControllerGetSessionQueryKey(taxYear) })
  }

  async function applyDraft(overwriteExisting: boolean, addToExisting = false) {
    if (stagedScan === null) return
    const draftEvaluation = evaluateStagedDraft(stagedScan)
    const { bruttoarbeitslohn, lohnsteuer, sozialversicherung } = draftEvaluation.values
    if (bruttoarbeitslohn === null || lohnsteuer === null || !draftEvaluation.readyToApply) return
    const lines = draftEvaluation.lineValues
    const employer = stagedScan.employer?.text.trim() ?? ''

    setError(null)
    try {
      await confirmScan.mutateAsync({
        jahr: taxYear,
        ...(params ? { params } : {}),
        data: {
          bruttoarbeitslohn,
          lohnsteuer,
          ...(sozialversicherung !== null ? { sozialversicherung } : {}),
          ...(stagedScan.receiptId !== null ? { receiptId: stagedScan.receiptId } : {}),
          ...(stagedScan.actionIds.length > 0 ? { actionIds: [...stagedScan.actionIds] } : {}),
          ...(Object.keys(lines).length > 0 ? { lines } : {}),
          ...(employer !== '' ? { arbeitgeber: employer } : {}),
          ...(overwriteExisting ? { overwriteExisting: true } : {}),
          ...(addToExisting ? { addToExisting: true } : {}),
        },
      })
      setLocallyDismissed(true)
      setStagedScan(null)
      setOverwriteConflict(false)
      setSameCertificate(false)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getLstbControllerGetLstbQueryKey(taxYear, params) }),
        // The further lines were written with the three values: the mask's sections show them.
        queryClient.invalidateQueries({ queryKey: getLstbControllerGetLinesQueryKey(taxYear, params) }),
        queryClient.invalidateQueries({ queryKey: getLstbControllerGetChurchTaxQueryKey(taxYear, params) }),
        queryClient.invalidateQueries({ queryKey: getLstbControllerGetSubsidiesQueryKey(taxYear, params) }),
        queryClient.invalidateQueries({ queryKey: getLstbControllerGetEmployerQueryKey(taxYear, params) }),
        queryClient.invalidateQueries({ queryKey: getCockpitControllerGetCockpitSummaryQueryKey(taxYear) }),
        queryClient.invalidateQueries({ queryKey: getTaxEstimateControllerGetQueryKey(taxYear) }),
        queryClient.invalidateQueries({ queryKey: getConfirmationControllerGetQueryKey(taxYear) }),
        queryClient.invalidateQueries({ queryKey: getReceiptControllerListQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getAdvisorControllerGetSessionQueryKey(taxYear) }),
      ])
    } catch (error) {
      if (classifyApiFailure(error).kind === 'conflict') {
        if (classifyApiFailure(error).code === 'LSTB_SAME_CERTIFICATE') {
          setSameCertificate(true)
          return
        }
        // Existing values: a visible choice, never a silent overwrite (ADR-0008, AC 8).
        setOverwriteConflict(true)
        return
      }
      // NM-07 / WEB-10: a 401, 429 or lost connection says what it is; the draft stays to try again.
      setError(failureMessage(error, { server: tr('lstb.scan.error.confirmFailed'), unknown: tr('lstb.scan.error.confirmFailed') }))
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
    updateLineText,
    confirmLine,
    updateEmployerText,
    confirmEmployer,
    discardDraft,
    applyDraft,
    dismissYearConflict: () => setYearConflict(null),
    dismissOverwriteConflict: () => setOverwriteConflict(false),
    setPreviewOpen,
  }
}
