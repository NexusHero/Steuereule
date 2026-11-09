import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { AdvisorActionProposal, AdvisorChatMessageView, Screen } from '@steuereule/core'
import {
  advisorControllerApplyAction,
  advisorControllerApplyBatch,
  advisorControllerUndoAction,
  getAdvisorControllerGetSessionQueryKey,
  getAdvisorControllerStreamMessageUrl,
  getApiClientBaseUrl,
  getAssessmentControllerGetQueryKey,
  getCapitalControllerGetQueryKey,
  getChSalaryCertificateControllerGetQueryKey,
  getChildrenControllerListQueryKey,
  getCockpitControllerGetCockpitSummaryQueryKey,
  getCommuteControllerGetQueryKey,
  getConfirmationControllerGetQueryKey,
  getInterviewControllerGetInterviewQueryKey,
  getLstbControllerGetLstbQueryKey,
  getOwlModeControllerGetCardsQueryKey,
  getOwlModeControllerGetSettingQueryKey,
  getPensionControllerGetQueryKey,
  getPrintoutControllerCheckQueryKey,
  getRentalControllerGetQueryKey,
  getTaxEstimateControllerGetQueryKey,
  receiptParseControllerParseReceipt,
  type ParseReceiptDtoMimeType,
  type ParseReceiptResponseDto,
  type SendAdvisorMessageResponseDto,
} from '@steuereule/api-client'

export type CopilotMode = 'cockpit' | 'eulen-modus'

export type OwlViewMode =
  | { readonly kind: 'stage' }
  | { readonly kind: 'mask'; readonly screen: Screen; readonly field?: string | undefined }

export type TileProvenanceKind = 'beleg+eule' | 'eule' | 'nutzer'

export interface CockpitBannerState {
  readonly appliedCount: number
  readonly screens: readonly Screen[]
  readonly lastDeltaEur: number
  readonly timestamp: number
}

export interface StaleFieldConflict {
  readonly actionId?: string | undefined
  readonly key: string
  readonly currentValue: string | null
}

export interface StaleConflictState {
  readonly actionIds: readonly string[]
  readonly message: string
  /** Fields that changed under the draft, with the value the server saw — re-sent to re-baseline. */
  readonly conflicts: readonly StaleFieldConflict[]
}

export interface ParseReceiptInput {
  readonly fileName: string
  readonly rawText?: string | undefined
  readonly imageBase64?: string | undefined
  readonly mimeType?: ParseReceiptDtoMimeType | undefined
  readonly stageDraft?: boolean | undefined
}

export interface CopilotBridgeContextValue {
  readonly mode: CopilotMode
  readonly insideOwlWorkspace: boolean
  readonly taxYear: number
  readonly isAuthenticated: boolean
  readonly setMode: (next: CopilotMode) => void
  readonly owlViewMode: OwlViewMode
  readonly openMaskPreview: (screen: Screen, field?: string) => void
  readonly returnToStage: () => void
  readonly streaming: boolean
  readonly streamSteps: readonly string[]
  readonly streamedText: string
  /** True when the last answer came from the deterministic engine because no model answered. */
  readonly basisMode: boolean
  readonly chatError: string | null
  readonly clearChatError: () => void
  readonly sendStreamingMessage: (message: string, activeScreen?: Screen) => Promise<AdvisorChatMessageView[] | null>
  readonly batchApplying: boolean
  readonly staleConflict: StaleConflictState | null
  readonly clearStaleConflict: () => void
  readonly applyAllPending: (
    drafts: readonly AdvisorActionProposal[],
    options?: { readonly acknowledgedConflict?: StaleConflictState | undefined },
  ) => Promise<boolean>
  readonly applySingleAction: (actionId: string) => Promise<boolean>
  readonly undoSingleAction: (actionId: string) => Promise<boolean>
  readonly parsingReceipt: boolean
  readonly lastParsedReceipt: ParseReceiptResponseDto | null
  readonly receiptLinkedActionIds: ReadonlySet<string>
  readonly parseReceipt: (input: ParseReceiptInput) => Promise<ParseReceiptResponseDto | null>
  readonly provenanceByScreen: Readonly<Partial<Record<Screen, TileProvenanceKind>>>
  readonly bestTileProvenance: (screens: readonly Screen[]) => TileProvenanceKind | null
  readonly cockpitBanner: CockpitBannerState | null
  readonly dismissCockpitBanner: () => void
}

export interface CopilotBridgeProviderProps {
  readonly mode: CopilotMode
  readonly onModeChange: (next: CopilotMode) => void
  readonly taxYear: number
  readonly isAuthenticated?: boolean | undefined
  readonly children: ReactNode
}

const CopilotBridgeContext = createContext<CopilotBridgeContextValue | null>(null)

const PROVENANCE_PRIORITY: Readonly<Record<TileProvenanceKind, number>> = {
  'beleg+eule': 3,
  eule: 2,
  nutzer: 1,
}

function upgradeProvenance(
  current: TileProvenanceKind | undefined,
  next: TileProvenanceKind,
): TileProvenanceKind {
  if (!current) return next
  return PROVENANCE_PRIORITY[next] > PROVENANCE_PRIORITY[current] ? next : current
}

function extractStaleConflicts(payload: unknown): StaleFieldConflict[] {
  if (typeof payload !== 'object' || payload === null || !('details' in payload)) return []
  const details = (payload as { details: unknown }).details
  if (typeof details !== 'object' || details === null || !('conflicts' in details)) return []
  const conflicts = (details as { conflicts: unknown }).conflicts
  if (!Array.isArray(conflicts)) return []
  return conflicts.flatMap((c: unknown) => {
    if (typeof c !== 'object' || c === null) return []
    const { actionId, key, currentValue } = c as Record<string, unknown>
    if (typeof key !== 'string' || (currentValue !== null && typeof currentValue !== 'string')) return []
    return [{ ...(typeof actionId === 'string' ? { actionId } : {}), key, currentValue }]
  })
}

/** Per draft, the fields the user accepted at their current value after seeing the conflict. */
function acknowledgedValuesFor(
  actionId: string,
  conflict: StaleConflictState | undefined,
): Record<string, string | null> | undefined {
  if (!conflict) return undefined
  const own = conflict.conflicts.filter((c) => c.actionId === undefined || c.actionId === actionId)
  return own.length === 0 ? undefined : Object.fromEntries(own.map((c) => [c.key, c.currentValue]))
}

function extractErrorMessage(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null
  if ('message' in payload && typeof (payload as { message: unknown }).message === 'string') {
    return (payload as { message: string }).message
  }
  return null
}

export async function invalidateAllTaxQueries(queryClient: QueryClient, taxYear: number): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: getAdvisorControllerGetSessionQueryKey(taxYear) }),
    queryClient.invalidateQueries({ queryKey: getOwlModeControllerGetSettingQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getOwlModeControllerGetCardsQueryKey(taxYear) }),
    queryClient.invalidateQueries({ queryKey: getCockpitControllerGetCockpitSummaryQueryKey(taxYear) }),
    queryClient.invalidateQueries({ queryKey: getTaxEstimateControllerGetQueryKey(taxYear) }),
    queryClient.invalidateQueries({ queryKey: getInterviewControllerGetInterviewQueryKey(taxYear) }),
    queryClient.invalidateQueries({ queryKey: getLstbControllerGetLstbQueryKey(taxYear) }),
    queryClient.invalidateQueries({ queryKey: getCommuteControllerGetQueryKey(taxYear) }),
    queryClient.invalidateQueries({ queryKey: getChSalaryCertificateControllerGetQueryKey(taxYear) }),
    queryClient.invalidateQueries({ queryKey: getCapitalControllerGetQueryKey(taxYear) }),
    queryClient.invalidateQueries({ queryKey: getRentalControllerGetQueryKey(taxYear) }),
    queryClient.invalidateQueries({ queryKey: getChildrenControllerListQueryKey(taxYear) }),
    queryClient.invalidateQueries({ queryKey: getPensionControllerGetQueryKey(taxYear) }),
    queryClient.invalidateQueries({ queryKey: getAssessmentControllerGetQueryKey(taxYear) }),
    queryClient.invalidateQueries({ queryKey: getConfirmationControllerGetQueryKey(taxYear) }),
    queryClient.invalidateQueries({ queryKey: getPrintoutControllerCheckQueryKey(taxYear) }),
  ])
}

function parseSseBlock(block: string): { event: string; data: unknown } | null {
  const lines = block.split(/\r?\n/)
  let eventName = 'message'
  const dataLines: string[] = []
  for (const line of lines) {
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart())
    }
  }
  if (dataLines.length === 0) return null
  const rawJson = dataLines.join('\n')
  try {
    return { event: eventName, data: JSON.parse(rawJson) as unknown }
  } catch {
    return null
  }
}

export function CopilotBridgeProvider({
  mode,
  onModeChange,
  taxYear,
  isAuthenticated = true,
  children,
}: CopilotBridgeProviderProps) {
  const queryClient = useQueryClient()
  const [owlViewMode, setOwlViewMode] = useState<OwlViewMode>({ kind: 'stage' })
  const [streaming, setStreaming] = useState(false)
  const [streamSteps, setStreamSteps] = useState<readonly string[]>([])
  const [streamedText, setStreamedText] = useState('')
  const [basisMode, setBasisMode] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const [batchApplying, setBatchApplying] = useState(false)
  const [staleConflict, setStaleConflict] = useState<StaleConflictState | null>(null)
  const [parsingReceipt, setParsingReceipt] = useState(false)
  const [lastParsedReceipt, setLastParsedReceipt] = useState<ParseReceiptResponseDto | null>(null)
  const [receiptLinkedActionIds, setReceiptLinkedActionIds] = useState<ReadonlySet<string>>(() => new Set())
  const [provenanceByScreen, setProvenanceByScreen] = useState<Readonly<Partial<Record<Screen, TileProvenanceKind>>>>({})
  const [cockpitBanner, setCockpitBanner] = useState<CockpitBannerState | null>(null)

  const setMode = useCallback(
    (next: CopilotMode) => {
      if (next === 'cockpit') {
        setOwlViewMode({ kind: 'stage' })
      }
      onModeChange(next)
    },
    [onModeChange],
  )

  const openMaskPreview = useCallback((screen: Screen, field?: string) => {
    setOwlViewMode(field === undefined ? { kind: 'mask', screen } : { kind: 'mask', screen, field })
  }, [])

  const returnToStage = useCallback(() => {
    setOwlViewMode({ kind: 'stage' })
  }, [])

  const recordAppliedActions = useCallback(
    (actions: readonly AdvisorActionProposal[]) => {
      if (actions.length === 0) return
      setProvenanceByScreen((prev) => {
        const next: Partial<Record<Screen, TileProvenanceKind>> = { ...prev }
        for (const action of actions) {
          const srcKind: TileProvenanceKind = receiptLinkedActionIds.has(action.actionId) ? 'beleg+eule' : 'eule'
          next[action.screen] = upgradeProvenance(next[action.screen], srcKind)
        }
        return next
      })
    },
    [receiptLinkedActionIds],
  )

  const sendStreamingMessage = useCallback(
    async (message: string, activeScreen?: Screen): Promise<AdvisorChatMessageView[] | null> => {
      if (!isAuthenticated) return null
      setChatError(null)
      setStreamSteps([])
      setStreamedText('')
      setStreaming(true)

      try {
        const url = `${getApiClientBaseUrl()}${getAdvisorControllerStreamMessageUrl(taxYear)}`
        const response = await fetch(url, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({
            message,
            ...(activeScreen ? { activeScreen } : {}),
          }),
        })

        if (!response.ok) {
          const textBody = await response.text().catch(() => '')
          let parsed: unknown = null
          try {
            parsed = textBody ? JSON.parse(textBody) : null
          } catch {
            parsed = null
          }
          setChatError(extractErrorMessage(parsed) ?? `HTTP ${response.status}`)
          return null
        }

        const contentType = response.headers.get('content-type') ?? ''
        let doneResponse: SendAdvisorMessageResponseDto | null = null

        const handleSseEvent = (parsedEvent: { event: string; data: unknown }) => {
          const { event, data } = parsedEvent
          if (event === 'status' && typeof data === 'object' && data !== null && 'text' in data) {
            const text = String((data as { text: unknown }).text)
            setStreamSteps((prev) => [...prev, text])
          } else if (event === 'tool' && typeof data === 'object' && data !== null && 'label' in data) {
            const label = String((data as { label: unknown }).label)
            setStreamSteps((prev) => [...prev, label])
          } else if (event === 'token' && typeof data === 'object' && data !== null && 'text' in data) {
            const chunk = String((data as { text: unknown }).text)
            setStreamedText((prev) => prev + chunk)
          } else if (event === 'ui_command' && typeof data === 'object' && data !== null && 'openMask' in data) {
            const { openMask, focus } = data as { openMask: Screen; focus?: unknown }
            openMaskPreview(openMask, typeof focus === 'string' ? focus : undefined)
          } else if (event === 'error' && typeof data === 'object' && data !== null) {
            setStreamedText('')
            setChatError(extractErrorMessage(data) ?? 'Die Antwort der Eule ist unterwegs abgebrochen.')
          } else if (event === 'done' && typeof data === 'object' && data !== null) {
            doneResponse = data as SendAdvisorMessageResponseDto
            setBasisMode(doneResponse.mode === 'deterministic_fallback')
          }
        }

        if (contentType.includes('text/event-stream')) {
          if (response.body && typeof response.body.getReader === 'function') {
            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ''
            for (;;) {
              const { value, done } = await reader.read()
              if (done) break
              buffer += decoder.decode(value, { stream: true })
              const parts = buffer.split(/\r?\n\r?\n/)
              buffer = parts.pop() ?? ''
              for (const part of parts) {
                const parsed = parseSseBlock(part)
                if (parsed) handleSseEvent(parsed)
              }
            }
            if (buffer.trim()) {
              const parsed = parseSseBlock(buffer)
              if (parsed) handleSseEvent(parsed)
            }
          } else {
            const fullText = await response.text()
            for (const part of fullText.split(/\r?\n\r?\n/)) {
              const parsed = parseSseBlock(part)
              if (parsed) handleSseEvent(parsed)
            }
          }
        } else {
          doneResponse = (await response.json()) as SendAdvisorMessageResponseDto
        }

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getAdvisorControllerGetSessionQueryKey(taxYear) }),
          queryClient.invalidateQueries({ queryKey: getOwlModeControllerGetSettingQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getOwlModeControllerGetCardsQueryKey(taxYear) }),
        ])

        if (doneResponse?.userMessage && doneResponse?.assistantMessage) {
          return [
            doneResponse.userMessage as unknown as AdvisorChatMessageView,
            doneResponse.assistantMessage as unknown as AdvisorChatMessageView,
          ]
        }
        return []
      } catch (error) {
        setChatError(error instanceof Error ? error.message : 'Verbindung unterbrochen.')
        return null
      } finally {
        setStreaming(false)
      }
    },
    [isAuthenticated, openMaskPreview, queryClient, taxYear],
  )

  const applyAllPending = useCallback(
    async (
      drafts: readonly AdvisorActionProposal[],
      options?: { readonly acknowledgedConflict?: StaleConflictState | undefined },
    ): Promise<boolean> => {
      if (!isAuthenticated || drafts.length === 0) return false
      setBatchApplying(true)
      setStaleConflict(null)
      setChatError(null)
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
          onModeChange('cockpit')
          return true
        }

        if ((res.status as number) === 409) {
          setStaleConflict({
            actionIds: drafts.map((d) => d.actionId),
            message:
              extractErrorMessage(res.data) ??
              'Ein Wert wurde zwischenzeitlich manuell geändert. Bitte prüfen oder mit neuem Stand übernehmen.',
            conflicts: extractStaleConflicts(res.data),
          })
          await queryClient.invalidateQueries({ queryKey: getAdvisorControllerGetSessionQueryKey(taxYear) })
          return false
        }

        setChatError(extractErrorMessage(res.data) ?? `Übernahme fehlgeschlagen (HTTP ${res.status}).`)
        return false
      } catch (error) {
        setChatError(error instanceof Error ? error.message : 'Übernahme fehlgeschlagen.')
        return false
      } finally {
        setBatchApplying(false)
      }
    },
    [isAuthenticated, onModeChange, queryClient, recordAppliedActions, taxYear],
  )

  const applySingleAction = useCallback(
    async (actionId: string): Promise<boolean> => {
      if (!isAuthenticated) return false
      setStaleConflict(null)
      setChatError(null)
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
            message: extractErrorMessage(res.data) ?? 'Wert wurde zwischenzeitlich manuell geändert.',
            conflicts: extractStaleConflicts(res.data),
          })
          return false
        }
        return false
      } catch {
        return false
      }
    },
    [isAuthenticated, queryClient, recordAppliedActions, taxYear],
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
        setChatError(extractErrorMessage(res.data) ?? `Rückgängig machen fehlgeschlagen (HTTP ${res.status}).`)
        return false
      } catch {
        return false
      }
    },
    [isAuthenticated, queryClient, taxYear],
  )

  const parseReceipt = useCallback(
    async (input: ParseReceiptInput): Promise<ParseReceiptResponseDto | null> => {
      if (!isAuthenticated) return null
      setParsingReceipt(true)
      setChatError(null)
      try {
        const res = await receiptParseControllerParseReceipt({
          taxYear,
          fileName: input.fileName,
          ...(input.rawText !== undefined ? { rawText: input.rawText } : {}),
          ...(input.imageBase64 !== undefined ? { imageBase64: input.imageBase64 } : {}),
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
        setChatError(`Belegprüfung fehlgeschlagen (HTTP ${res.status}).`)
        return null
      } catch (error) {
        setChatError(error instanceof Error ? error.message : 'Belegprüfung fehlgeschlagen.')
        return null
      } finally {
        setParsingReceipt(false)
      }
    },
    [isAuthenticated, queryClient, taxYear],
  )

  const bestTileProvenance = useCallback(
    (screens: readonly Screen[]): TileProvenanceKind | null => {
      let best: TileProvenanceKind | null = null
      for (const s of screens) {
        const kind = provenanceByScreen[s]
        if (kind && (best === null || PROVENANCE_PRIORITY[kind] > PROVENANCE_PRIORITY[best])) {
          best = kind
        }
      }
      return best
    },
    [provenanceByScreen],
  )

  const value = useMemo<CopilotBridgeContextValue>(
    () => ({
      mode,
      insideOwlWorkspace: mode === 'eulen-modus',
      taxYear,
      isAuthenticated,
      setMode,
      owlViewMode,
      openMaskPreview,
      returnToStage,
      streaming,
      streamSteps,
      streamedText,
      basisMode,
      chatError,
      clearChatError: () => setChatError(null),
      sendStreamingMessage,
      batchApplying,
      staleConflict,
      clearStaleConflict: () => setStaleConflict(null),
      applyAllPending,
      applySingleAction,
      undoSingleAction,
      parsingReceipt,
      lastParsedReceipt,
      receiptLinkedActionIds,
      parseReceipt,
      provenanceByScreen,
      bestTileProvenance,
      cockpitBanner,
      dismissCockpitBanner: () => setCockpitBanner(null),
    }),
    [
      mode,
      taxYear,
      isAuthenticated,
      setMode,
      owlViewMode,
      openMaskPreview,
      returnToStage,
      streaming,
      streamSteps,
      streamedText,
      basisMode,
      chatError,
      sendStreamingMessage,
      batchApplying,
      staleConflict,
      applyAllPending,
      applySingleAction,
      undoSingleAction,
      parsingReceipt,
      lastParsedReceipt,
      receiptLinkedActionIds,
      parseReceipt,
      provenanceByScreen,
      bestTileProvenance,
      cockpitBanner,
    ],
  )

  return <CopilotBridgeContext.Provider value={value}>{children}</CopilotBridgeContext.Provider>
}

export function useOptionalCopilotBridge(): CopilotBridgeContextValue | null {
  return useContext(CopilotBridgeContext)
}

export function useCopilotBridge(): CopilotBridgeContextValue {
  const ctx = useContext(CopilotBridgeContext)
  if (ctx === null) {
    throw new Error('useCopilotBridge() called outside a <CopilotBridgeProvider>.')
  }
  return ctx
}
