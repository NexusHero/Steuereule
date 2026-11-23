import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { AdvisorActionProposal, Screen } from '@steuereule/core'
import {
  advisorControllerApplyAction,
  advisorControllerApplyBatch,
  advisorControllerUndoAction,
  getAdvisorControllerGetSessionQueryKey,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { apiErrorText } from './chat/apiErrorText'
import type { CockpitBannerState, CopilotMode, OwlViewMode, StaleConflictState, TileProvenanceKind } from './CopilotBridge.types'
import { acknowledgedValuesFor, bestProvenance, extractStaleConflicts, provenanceAfterApply } from './CopilotBridgeHelpers'
import { invalidateAllTaxQueries } from './CopilotBridgeQueries'

export interface UseCopilotBridgeActionsInput {
  readonly taxYear: number
  readonly isAuthenticated: boolean
  readonly onModeChange: (next: CopilotMode) => void
  readonly setOwlViewMode: (next: OwlViewMode) => void
  /** Errors outside an answer belong to the conversation that is open. */
  readonly setOpenChatError: (update: string | null) => void
  readonly receiptLinkedActionIds: ReadonlySet<string>
}

/** Applying and undoing the owl's drafts, the stale-value conflict, provenance of tiles and the cockpit banner. */
export function useCopilotBridgeActions({ taxYear, isAuthenticated, onModeChange, setOwlViewMode, setOpenChatError, receiptLinkedActionIds }: UseCopilotBridgeActionsInput) {
  const queryClient = useQueryClient()
  const { t: tr } = useTranslation(APP_NS)
  const [batchApplying, setBatchApplying] = useState(false)
  const [staleConflict, setStaleConflict] = useState<StaleConflictState | null>(null)
  const [provenanceByScreen, setProvenanceByScreen] = useState<Readonly<Partial<Record<Screen, TileProvenanceKind>>>>({})
  const [cockpitBanner, setCockpitBanner] = useState<CockpitBannerState | null>(null)

  const recordAppliedActions = useCallback(
    (actions: readonly AdvisorActionProposal[]) => {
      if (actions.length === 0) return
      setProvenanceByScreen((prev) => provenanceAfterApply(prev, actions, receiptLinkedActionIds))
    },
    [receiptLinkedActionIds],
  )

  const applyAllPending = useCallback(
    async (
      drafts: readonly AdvisorActionProposal[],
      options?: { readonly acknowledgedConflict?: StaleConflictState | undefined; /** Stay in the owl instead of jumping to the cockpit. */ readonly stay?: boolean | undefined },
    ): Promise<boolean> => {
      if (!isAuthenticated || drafts.length === 0) return false
      setBatchApplying(true)
      setStaleConflict(null)
      setOpenChatError(null)
      try {
        const res = await advisorControllerApplyBatch(taxYear, {
          drafts: drafts.map((d) => {
            const acknowledgedCurrentValues = acknowledgedValuesFor(d.actionId, options?.acknowledgedConflict)
            return acknowledgedCurrentValues ? { actionId: d.actionId, acknowledgedCurrentValues } : { actionId: d.actionId }
          }),
        })

        if (res.status === 200) {
          const applied = res.data.actions as unknown as readonly AdvisorActionProposal[]
          recordAppliedActions(applied)
          const screens = [...new Set(applied.map((a) => a.screen))]
          const lastDeltaEur = applied.reduce((sum, a) => sum + (a.deltaEur ?? 0), 0)
          setCockpitBanner({
            appliedCount: applied.length,
            screens,
            lastDeltaEur,
            timestamp: Date.now(),
          })
          await invalidateAllTaxQueries(queryClient, taxYear)
          setOwlViewMode({ kind: 'stage' })
          // From the owl's workbench the user stays in the conversation; the cockpit shows the result when they go there.
          if (!options?.stay) onModeChange('cockpit')
          return true
        }

        if ((res.status as number) === 409) {
          setStaleConflict({
            actionIds: drafts.map((d) => d.actionId),
            message:
              apiErrorText(res.data) ??
              'Ein Wert wurde zwischenzeitlich manuell geändert. Bitte prüfen oder mit neuem Stand übernehmen.',
            conflicts: extractStaleConflicts(res.data),
          })
          await queryClient.invalidateQueries({ queryKey: getAdvisorControllerGetSessionQueryKey(taxYear) })
          return false
        }

        setOpenChatError(apiErrorText(res.data) ?? `Übernahme fehlgeschlagen (HTTP ${res.status}).`)
        return false
      } catch (error) {
        setOpenChatError(error instanceof Error ? error.message : 'Übernahme fehlgeschlagen.')
        return false
      } finally {
        setBatchApplying(false)
      }
    },
    [isAuthenticated, onModeChange, queryClient, recordAppliedActions, taxYear],
  )

  const [applyFailure, setApplyFailure] = useState<{ readonly actionId: string; readonly message: string } | null>(null)
  const applySingleAction = useCallback(
    async (actionId: string): Promise<boolean> => {
      if (!isAuthenticated) return false
      setApplyFailure(null)
      setStaleConflict(null)
      setOpenChatError(null)
      try {
        const res = await advisorControllerApplyAction(taxYear, actionId)
        if (res.status === 200) {
          const action = res.data.action as unknown as AdvisorActionProposal
          recordAppliedActions([action])
          await invalidateAllTaxQueries(queryClient, taxYear)
          return true
        }
        if ((res.status as number) === 409) {
          setStaleConflict({
            actionIds: [actionId],
            message: apiErrorText(res.data) ?? 'Wert wurde zwischenzeitlich manuell geändert.',
            conflicts: extractStaleConflicts(res.data),
          })
          return false
        }
        // A draft that cannot be written must say so; a button that does nothing is the worst answer.
        const reason = apiErrorText(res.data) ?? tr('advisor.chat.applyFailed')
        setApplyFailure({ actionId, message: reason })
        setOpenChatError(reason)
        return false
      } catch {
        setApplyFailure({ actionId, message: tr('advisor.chat.applyFailed') })
        setOpenChatError(tr('advisor.chat.applyFailed'))
        return false
      }
    },
    [isAuthenticated, queryClient, recordAppliedActions, taxYear, tr],
  )

  const undoSingleAction = useCallback(
    async (actionId: string): Promise<boolean> => {
      if (!isAuthenticated) return false
      try {
        const res = await advisorControllerUndoAction(taxYear, actionId)
        if (res.status === 200) {
          await invalidateAllTaxQueries(queryClient, taxYear)
          return true
        }
        // A manual edit after the apply wins over the undo; tell the user instead of failing silently.
        setOpenChatError(apiErrorText(res.data) ?? `Rückgängig machen fehlgeschlagen (HTTP ${res.status}).`)
        return false
      } catch {
        return false
      }
    },
    [isAuthenticated, queryClient, taxYear],
  )

  const bestTileProvenance = useCallback(
    (screens: readonly Screen[]): TileProvenanceKind | null => bestProvenance(provenanceByScreen, screens),
    [provenanceByScreen],
  )

  return {
    batchApplying,
    staleConflict,
    setStaleConflict,
    applyAllPending,
    applySingleAction,
    applyFailure,
    undoSingleAction,
    provenanceByScreen,
    bestTileProvenance,
    cockpitBanner,
    setCockpitBanner,
  }
}
