import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { foldThoughtEvent, type AdvisorActionProposal, type AdvisorChatMessageView, type AdvisorPlanStepStatus, type AdvisorQuickAction, type AdvisorSkillId, type AdvisorThoughtStep, type DetectedDocumentKind, type Screen } from '@steuereule/core'
import {
  advisorControllerApplyAction,
  advisorControllerApplyBatch,
  advisorControllerGetSession,
  advisorControllerStopRun,
  advisorControllerUndoAction,
  getAdvisorControllerConnectionQueryKey,
  getAdvisorControllerGetSessionQueryKey,
  getAdvisorControllerRunEventsUrl,
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
  getReceiptControllerListQueryKey,
  getRentalControllerGetQueryKey,
  getTaxEstimateControllerGetQueryKey,
  receiptParseControllerParseReceipt,
  type ParseReceiptDtoMimeType,
  type ParseReceiptResponseDto,
  type SendAdvisorMessageResponseDto,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { captureReceipt, type CapturePhase, type CaptureResult } from '../../lib/receipts/captureReceipt'
import { createFrameBatcher } from './chat/frameBatcher'
import { followRun, type RunFrame } from './chat/runStream'

/** What one conversation shows of its answer while it is written, and what is left when it stops or fails. */
interface ConversationStream {
  readonly streaming: boolean
  readonly streamSteps: readonly AdvisorThoughtStep[]
  readonly streamedText: string
  readonly streamedReasoning: string
  readonly chatError: string | null
  readonly abortedTurn: AbortedTurn | null
  readonly plan: AdvisorPlanView | null
  readonly pendingUserMessage: AdvisorChatMessageView | null
  readonly reconnecting: boolean
}

const IDLE_STREAM: ConversationStream = { streaming: false, streamSteps: [], streamedText: '', streamedReasoning: '', chatError: null, abortedTurn: null, plan: null, pendingUserMessage: null, reconnecting: false }

/** Where an answer is filed that was asked before the screen knew which conversation is open. */
const PENDING_CONVERSATION = '(pending)'

type StreamUpdate<T> = T | ((previous: T) => T)

/** An answer this provider is following. */
interface ActiveRun {
  /** Known from the `start` event, or up front when re-attaching. */
  id: string | null
  /** Set by Stop; tells a user's stop apart from a request that was merely superseded. */
  stopped: boolean
}

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

/** A turn the user stopped: its partial text stays visible, nothing of it is persisted or applicable. */
export interface AbortedTurn {
  readonly question: string
  readonly partialText: string
}

/** One step of the owl's plan as the chat shows it; `abgebrochen` only ever comes from Stop. */
export interface PlanStepView {
  readonly text: string
  readonly status: AdvisorPlanStepStatus | 'abgebrochen'
}

/** The plan of the current (or last) answer, kept per answer and never persisted (#451 slice 6). */
export interface AdvisorPlanView {
  readonly steps: readonly PlanStepView[]
  readonly finished: boolean
}

export interface SendStreamingOptions {
  readonly quickAction?: AdvisorQuickAction | undefined
  /** Regenerate / edit-and-resend: the latest user message whose turn the answer replaces. */
  readonly replaceFromMessageId?: string | undefined
  readonly skill?: AdvisorSkillId | undefined
  readonly turbo?: boolean | undefined
}

/** Marks the running step of a stopped plan as aborted; finished steps stay as they are. */
export function abortPlan(plan: AdvisorPlanView | null): AdvisorPlanView | null {
  if (plan === null) return null
  return { finished: true, steps: plan.steps.map((s) => (s.status === 'laeuft' ? { ...s, status: 'abgebrochen' } : s)) }
}

function parsePlanSteps(data: unknown): PlanStepView[] | null {
  if (typeof data !== 'object' || data === null || !('steps' in data)) return null
  const steps = (data as { steps: unknown }).steps
  if (!Array.isArray(steps)) return null
  return steps.flatMap((step: unknown) => {
    if (typeof step !== 'object' || step === null) return []
    const { text, status } = step as Record<string, unknown>
    return typeof text === 'string' && (status === 'offen' || status === 'laeuft' || status === 'erledigt') ? [{ text, status }] : []
  })
}

/** Messages on success, `null` on a failure (shown via `chatError`), `'aborted'` when the user stopped. */
export type StreamOutcome = AdvisorChatMessageView[] | null | 'aborted'

export interface ParseReceiptInput {
  readonly fileName: string
  readonly rawText?: string | undefined
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
  readonly streamSteps: readonly AdvisorThoughtStep[]
  readonly streamedText: string
  /** The reasoning summary of the running answer, as far as it has arrived (#476). */
  readonly streamedReasoning: string
  /** The question of the running turn, known from its first event; shown until the session has it. */
  readonly pendingUserMessage: AdvisorChatMessageView | null
  /** True while the connection to a running answer is being restored. */
  readonly reconnecting: boolean
  /** The conversation the chat is in (#481); null = the one used last in this tax year. */
  readonly conversationId: string | null
  readonly setConversationId: (id: string | null) => void
  /** Tells the provider which conversation the screen shows, once the server has said so. */
  readonly adoptConversationId: (id: string) => void
  /** Opens a conversation of any tax year; another year switches the whole app to it (#503). */
  readonly openConversationInYear: (year: number, id: string) => void
  /** The conversations this device is following an answer in right now; several at once are fine. */
  readonly answeringConversationIds: readonly string[]
  /** Follows an answer that was found still running, e.g. after a reload. */
  readonly resumeRun: (runId: string) => Promise<StreamOutcome>
  /** True when the last answer came from the deterministic engine because no model answered. */
  readonly basisMode: boolean
  readonly chatError: string | null
  readonly clearChatError: () => void
  readonly sendStreamingMessage: (message: string, activeScreen?: Screen, options?: SendStreamingOptions) => Promise<StreamOutcome>
  readonly plan: AdvisorPlanView | null
  /** Stops the running answer (Stop button, Escape). The partial text becomes `abortedTurn`. */
  readonly stopStreaming: () => void
  readonly abortedTurn: AbortedTurn | null
  readonly clearAbortedTurn: () => void
  readonly batchApplying: boolean
  readonly staleConflict: StaleConflictState | null
  readonly clearStaleConflict: () => void
  readonly applyAllPending: (
    drafts: readonly AdvisorActionProposal[],
    options?: { readonly acknowledgedConflict?: StaleConflictState | undefined; /** Stay in the owl instead of jumping to the cockpit. */ readonly stay?: boolean | undefined },
  ) => Promise<boolean>
  readonly applySingleAction: (actionId: string) => Promise<boolean>
  readonly undoSingleAction: (actionId: string) => Promise<boolean>
  readonly parsingReceipt: boolean
  readonly lastParsedReceipt: ParseReceiptResponseDto | null
  readonly receiptLinkedActionIds: ReadonlySet<string>
  readonly parseReceipt: (input: ParseReceiptInput) => Promise<ParseReceiptResponseDto | null>
  /** Upload a PDF or photo from the chat: stored encrypted, read on the device, parsed (#444). */
  readonly captureReceiptFile: (file: File) => Promise<CaptureResult | null>
  readonly receiptPhase: CapturePhase | null
  /** Plain-language outcome the chat shows after a capture (year conflict, unreadable file …). */
  readonly receiptNotice: string | null
  readonly clearReceiptNotice: () => void
  /** A Swiss salary certificate whose name fits neither person waits for the user to say whose it is. */
  readonly certificateOwnerPending: boolean
  readonly chooseCertificateOwner: (person: 'A' | 'B') => Promise<void>
  readonly provenanceByScreen: Readonly<Partial<Record<Screen, TileProvenanceKind>>>
  readonly bestTileProvenance: (screens: readonly Screen[]) => TileProvenanceKind | null
  readonly cockpitBanner: CockpitBannerState | null
  readonly dismissCockpitBanner: () => void
}

export interface CopilotBridgeProviderProps {
  readonly mode: CopilotMode
  readonly onModeChange: (next: CopilotMode) => void
  readonly taxYear: number
  /** Opens another tax year for the whole app: a conversation of that year was chosen in the owl (#503). */
  readonly onSwitchYear?: ((year: number) => void) | undefined
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
    // A turn just found out whether the model answers (#488).
    queryClient.invalidateQueries({ queryKey: getAdvisorControllerConnectionQueryKey(taxYear) }),
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

export function CopilotBridgeProvider({
  mode,
  onModeChange,
  taxYear,
  onSwitchYear,
  isAuthenticated = true,
  children,
}: CopilotBridgeProviderProps) {
  const queryClient = useQueryClient()
  const { t: tr } = useTranslation(APP_NS)
  const [owlViewMode, setOwlViewMode] = useState<OwlViewMode>({ kind: 'stage' })
  // Every conversation has its own answer (#503): what is streamed, planned, stopped or failed
  // belongs to the conversation it was asked in, and several can be answering at the same time.
  const [streams, setStreams] = useState<Readonly<Record<string, ConversationStream>>>({})
  const [basisMode, setBasisMode] = useState(false)
  const [conversationId, setConversationIdState] = useState<string | null>(null)
  // The conversation the server opened when none was chosen. It files that conversation's answer,
  // but it is never requested by id: that would load the same session a second time (#503).
  const [defaultConversationId, setDefaultConversationId] = useState<string | null>(null)
  const defaultIdRef = useRef<string | null>(null)
  /** Where the open conversation's answer is filed. */
  const keyOfOpen = (): string => conversationIdRef.current ?? defaultIdRef.current ?? PENDING_CONVERSATION
  // The stream request reads the id at send time; a ref keeps a send from using a stale one.
  const conversationIdRef = useRef<string | null>(null)
  const controllersRef = useRef<Map<string, AbortController>>(new Map())
  const runsRef = useRef<Map<string, ActiveRun>>(new Map())
  // An answer asked before the conversation's id is known is filed under PENDING and moved once it is.
  const scopesRef = useRef<Set<{ key: string }>>(new Set())
  const patchStream = useCallback(<K extends keyof ConversationStream>(key: string, field: K, update: StreamUpdate<ConversationStream[K]>) => {
    setStreams((prev) => {
      const current = prev[key] ?? IDLE_STREAM
      const next = typeof update === 'function' ? (update as (value: ConversationStream[K]) => ConversationStream[K])(current[field]) : update
      return next === current[field] ? prev : { ...prev, [key]: { ...current, [field]: next } }
    })
  }, [])
  const settersFor = useCallback(
    (scope: { readonly key: string }) => ({
      setStreaming: (update: StreamUpdate<boolean>) => patchStream(scope.key, 'streaming', update),
      setStreamSteps: (update: StreamUpdate<readonly AdvisorThoughtStep[]>) => patchStream(scope.key, 'streamSteps', update),
      setStreamedText: (update: StreamUpdate<string>) => patchStream(scope.key, 'streamedText', update),
      setStreamedReasoning: (update: StreamUpdate<string>) => patchStream(scope.key, 'streamedReasoning', update),
      setChatError: (update: StreamUpdate<string | null>) => patchStream(scope.key, 'chatError', update),
      setAbortedTurn: (update: StreamUpdate<AbortedTurn | null>) => patchStream(scope.key, 'abortedTurn', update),
      setPlan: (update: StreamUpdate<AdvisorPlanView | null>) => patchStream(scope.key, 'plan', update),
      setPendingUserMessage: (update: StreamUpdate<AdvisorChatMessageView | null>) => patchStream(scope.key, 'pendingUserMessage', update),
      setReconnecting: (update: StreamUpdate<boolean>) => patchStream(scope.key, 'reconnecting', update),
    }),
    [patchStream],
  )
  // Outside an answer (applying a draft, a receipt) an error belongs to the conversation that is open.
  const openScope = useMemo(
    () => ({
      get key() {
        return keyOfOpen()
      },
    }),
    [],
  )
  const { setChatError: setOpenChatError, setAbortedTurn: setOpenAbortedTurn } = useMemo(() => settersFor(openScope), [settersFor, openScope])
  const { streaming, streamSteps, streamedText, streamedReasoning, chatError, abortedTurn, plan, pendingUserMessage, reconnecting } = streams[conversationId ?? defaultConversationId ?? PENDING_CONVERSATION] ?? IDLE_STREAM
  const answeringConversationIds = useMemo(() => Object.keys(streams).filter((key) => key !== PENDING_CONVERSATION && streams[key]!.streaming), [streams])

  const setConversationId = useCallback((id: string | null) => {
    conversationIdRef.current = id
    setConversationIdState(id)
  }, [])
  /** The screen learned which conversation the server opened: what was asked before it knew moves there. */
  const adoptConversationId = useCallback((id: string) => {
    if (conversationIdRef.current !== null || defaultIdRef.current === id) return
    for (const scope of scopesRef.current) if (scope.key === PENDING_CONVERSATION) scope.key = id
    for (const registry of [controllersRef.current, runsRef.current] as Map<string, unknown>[]) {
      const entry = registry.get(PENDING_CONVERSATION)
      if (entry !== undefined) {
        registry.delete(PENDING_CONVERSATION)
        registry.set(id, entry)
      }
    }
    setStreams((prev) => {
      const { [PENDING_CONVERSATION]: pending, ...rest } = prev
      return pending === undefined ? prev : { ...rest, [id]: pending }
    })
    defaultIdRef.current = id
    setDefaultConversationId(id)
  }, [])
  // The year changed from outside the owl (not by opening one of its conversations): the open
  // conversation belongs to the other year, so the year's last used one is shown.
  const expectedYearRef = useRef(taxYear)
  useEffect(() => {
    if (expectedYearRef.current === taxYear) return
    expectedYearRef.current = taxYear
    conversationIdRef.current = null
    setConversationIdState(null)
    defaultIdRef.current = null
    setDefaultConversationId(null)
  }, [taxYear])
  /** Opens a conversation of another tax year: the year is the project, so the whole app switches to it. */
  const openConversationInYear = useCallback(
    (year: number, id: string) => {
      expectedYearRef.current = year
      conversationIdRef.current = id
      setConversationIdState(id)
      if (year !== taxYear) onSwitchYear?.(year)
    },
    [onSwitchYear, taxYear],
  )
  const resumedRunsRef = useRef<Set<string>>(new Set())
  const [batchApplying, setBatchApplying] = useState(false)
  const [staleConflict, setStaleConflict] = useState<StaleConflictState | null>(null)
  const [parsingReceipt, setParsingReceipt] = useState(false)
  const [lastParsedReceipt, setLastParsedReceipt] = useState<ParseReceiptResponseDto | null>(null)
  const [receiptPhase, setReceiptPhase] = useState<CapturePhase | null>(null)
  const [receiptNotice, setReceiptNotice] = useState<string | null>(null)
  const [certificateOwnerFile, setCertificateOwnerFile] = useState<{ file: File; receiptId: string | null; kind: DetectedDocumentKind } | null>(null)
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

  /**
   * Follows one answer to its end: a new one (`question` set) or one found still running. The
   * answer lives on the server, so a dropped connection is re-attached, not treated as an abort.
   */
  const followAnswer = useCallback(
    async (question: string | null, open: (signal: AbortSignal) => Promise<Response>, knownRunId?: string): Promise<StreamOutcome> => {
      // The answer belongs to the conversation that is open now, wherever the user goes meanwhile.
      const scope = { key: keyOfOpen() }
      scopesRef.current.add(scope)
      const { setStreaming, setStreamSteps, setStreamedText, setStreamedReasoning, setChatError, setAbortedTurn, setPlan, setPendingUserMessage, setReconnecting } = settersFor(scope)
      controllersRef.current.get(scope.key)?.abort()
      const controller = new AbortController()
      controllersRef.current.set(scope.key, controller)
      const run: ActiveRun = { id: knownRunId ?? null, stopped: false }
      runsRef.current.set(scope.key, run)
      let partialText = ''
      let failed = false
      let doneResponse: SendAdvisorMessageResponseDto | null = null
      const sessionKey = getAdvisorControllerGetSessionQueryKey(taxYear)
      const textBatcher = createFrameBatcher((text) => setStreamedText((prev) => prev + text))
      const reasoningBatcher = createFrameBatcher((text) => setStreamedReasoning((prev) => prev + text))

      // Only a stop the user asked for leaves an aborted bubble; a superseded request just ends.
      const endAborted = async (): Promise<'aborted'> => {
        if (run.stopped) {
          if (question !== null) setAbortedTurn({ question, partialText })
          setPlan(abortPlan)
        }
        await queryClient.invalidateQueries({ queryKey: sessionKey })
        return 'aborted'
      }

      setChatError(null)
      setAbortedTurn(null)
      setPlan(null)
      setStreamSteps([])
      setStreamedText('')
      setStreamedReasoning('')
      setPendingUserMessage(null)
      setReconnecting(false)
      setStreaming(true)

      const onFrame = ({ event, data }: RunFrame): void => {
        if (typeof data !== 'object' || data === null) return
        setReconnecting(false)
        if (event === 'start') {
          const { runId, userMessage } = data as { runId?: unknown; userMessage?: unknown }
          if (typeof runId === 'string') {
            run.id = runId
            // A run this provider follows itself is never picked up a second time as "found running".
            resumedRunsRef.current.add(runId)
          }
          if (typeof userMessage === 'object' && userMessage !== null) setPendingUserMessage(userMessage as AdvisorChatMessageView)
        } else if (event === 'status' && 'text' in data) {
          const text = String((data as { text: unknown }).text)
          setStreamSteps((prev) => foldThoughtEvent(prev, { event: 'status', data: { text } }))
        } else if (event === 'tool' && 'label' in data) {
          const { name, label } = data as { name?: unknown; label: unknown }
          setStreamSteps((prev) => foldThoughtEvent(prev, { event: 'tool', data: { name: String(name ?? ''), label: String(label) } }))
        } else if (event === 'tool_result' && 'result' in data) {
          const { name, ok, result } = data as { name?: unknown; ok?: unknown; result: unknown }
          setStreamSteps((prev) => foldThoughtEvent(prev, { event: 'tool_result', data: { name: String(name ?? ''), ok: ok === true, result: String(result) } }))
        } else if (event === 'token' && 'text' in data) {
          const chunk = String((data as { text: unknown }).text)
          partialText += chunk
          textBatcher.push(chunk)
        } else if (event === 'reasoning' && 'text' in data) {
          reasoningBatcher.push(String((data as { text: unknown }).text))
        } else if (event === 'plan') {
          const steps = parsePlanSteps(data)
          if (steps && steps.length > 0) setPlan({ steps, finished: false })
        } else if (event === 'ui_command' && 'openMask' in data) {
          const { openMask, focus } = data as { openMask: Screen; focus?: unknown }
          openMaskPreview(openMask, typeof focus === 'string' ? focus : undefined)
        } else if (event === 'error') {
          failed = true
          textBatcher.cancel()
          setStreamedText('')
          setChatError(extractErrorMessage(data) ?? tr('advisor.chat.turnFailed'))
        } else if (event === 'done') {
          doneResponse = data as SendAdvisorMessageResponseDto
          setBasisMode(doneResponse.mode === 'deterministic_fallback')
          setPlan((prev) => (prev === null ? null : { ...prev, finished: true }))
        }
      }

      try {
        const result = await followRun({
          open: () => open(controller.signal),
          resume: (runId, afterSeq) =>
            fetch(`${getApiClientBaseUrl()}${getAdvisorControllerRunEventsUrl(taxYear, runId)}`, {
              signal: controller.signal,
              credentials: 'include',
              headers: { Accept: 'text/event-stream', 'Last-Event-ID': String(afterSeq) },
            }),
          onFrame,
          signal: controller.signal,
          runId: knownRunId,
          onReconnecting: () => setReconnecting(true),
        })
        textBatcher.flush()
        reasoningBatcher.flush()

        if (result.kind === 'aborted') return await endAborted()
        if (result.kind === 'http-error') {
          setChatError(extractErrorMessage(result.body) ?? `HTTP ${result.status}`)
          return null
        }
        if (result.kind === 'lost') {
          // The answer may well have finished on the server; the stored conversation knows.
          setChatError(tr('advisor.chat.connectionLost'))
          await queryClient.invalidateQueries({ queryKey: sessionKey })
          return null
        }

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: sessionKey }),
          queryClient.invalidateQueries({ queryKey: getOwlModeControllerGetSettingQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getOwlModeControllerGetCardsQueryKey(taxYear) }),
        ])
        if (failed) return null
        const finished = doneResponse as SendAdvisorMessageResponseDto | null
        if (finished?.userMessage && finished.assistantMessage) {
          return [
            finished.userMessage as unknown as AdvisorChatMessageView,
            finished.assistantMessage as unknown as AdvisorChatMessageView,
          ]
        }
        return []
      } catch (error) {
        if (controller.signal.aborted) return await endAborted()
        setChatError(error instanceof Error ? error.message : tr('advisor.chat.connectionLost'))
        return null
      } finally {
        textBatcher.cancel()
        reasoningBatcher.cancel()
        scopesRef.current.delete(scope)
        if (controllersRef.current.get(scope.key) === controller) {
          controllersRef.current.delete(scope.key)
          runsRef.current.delete(scope.key)
          setPendingUserMessage(null)
          setReconnecting(false)
          setStreaming(false)
        }
      }
    },
    [openMaskPreview, queryClient, settersFor, taxYear, tr],
  )

  const sendStreamingMessage = useCallback(
    async (message: string, activeScreen?: Screen, options?: SendStreamingOptions): Promise<StreamOutcome> => {
      if (!isAuthenticated) return null
      return followAnswer(message, (signal) =>
        fetch(`${getApiClientBaseUrl()}${getAdvisorControllerStreamMessageUrl(taxYear)}`, {
          method: 'POST',
          signal,
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({
            message,
            ...(activeScreen ? { activeScreen } : {}),
            ...(options?.quickAction ? { quickAction: options.quickAction } : {}),
            ...(options?.replaceFromMessageId ? { replaceFromMessageId: options.replaceFromMessageId } : {}),
            ...(options?.skill ? { skill: options.skill } : {}),
            ...(options?.turbo ? { turbo: true } : {}),
            ...(conversationIdRef.current ? { conversationId: conversationIdRef.current } : {}),
          }),
        }),
      )
    },
    [followAnswer, isAuthenticated, taxYear],
  )

  const resumeRun = useCallback(
    async (runId: string): Promise<StreamOutcome> => {
      // One attempt per run: a run that cannot be followed must not be retried on every render.
      if (!isAuthenticated || resumedRunsRef.current.has(runId) || controllersRef.current.has(keyOfOpen())) return null
      resumedRunsRef.current.add(runId)
      return followAnswer(
        null,
        (signal) =>
          fetch(`${getApiClientBaseUrl()}${getAdvisorControllerRunEventsUrl(taxYear, runId)}`, {
            signal,
            credentials: 'include',
            headers: { Accept: 'text/event-stream' },
          }),
        runId,
      )
    },
    [followAnswer, isAuthenticated, taxYear],
  )

  /**
   * Stop is the only thing that ends an answer (#476): the connection is closed and the server is
   * told to stop the run, which stores the text so far as aborted.
   */
  const stopStreaming = useCallback(() => {
    const key = keyOfOpen()
    const run = runsRef.current.get(key)
    if (run === undefined) return
    run.stopped = true
    controllersRef.current.get(key)?.abort()
    void (async () => {
      try {
        let runId = run.id
        if (runId === null) {
          // Stopped before the first event arrived: the session knows which answer is running.
          const session = await advisorControllerGetSession(taxYear, key === PENDING_CONVERSATION ? undefined : { conversationId: key })
          const running = session.status === 200 ? session.data.messages.find((m) => m.status === 'streaming') : undefined
          runId = running?.runId ?? null
        }
        if (runId !== null) await advisorControllerStopRun(taxYear, runId)
      } catch {
        // Offline or already ended: the conversation shows whatever state the answer reached.
      } finally {
        await queryClient.invalidateQueries({ queryKey: getAdvisorControllerGetSessionQueryKey(taxYear) })
      }
    })()
  }, [queryClient, taxYear])

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
              extractErrorMessage(res.data) ??
              'Ein Wert wurde zwischenzeitlich manuell geändert. Bitte prüfen oder mit neuem Stand übernehmen.',
            conflicts: extractStaleConflicts(res.data),
          })
          await queryClient.invalidateQueries({ queryKey: getAdvisorControllerGetSessionQueryKey(taxYear) })
          return false
        }

        setOpenChatError(extractErrorMessage(res.data) ?? `Übernahme fehlgeschlagen (HTTP ${res.status}).`)
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

  const applySingleAction = useCallback(
    async (actionId: string): Promise<boolean> => {
      if (!isAuthenticated) return false
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
            message: extractErrorMessage(res.data) ?? 'Wert wurde zwischenzeitlich manuell geändert.',
            conflicts: extractStaleConflicts(res.data),
          })
          return false
        }
        // A draft that cannot be written must say so; a button that does nothing is the worst answer.
        setOpenChatError(extractErrorMessage(res.data) ?? tr('advisor.chat.applyFailed'))
        return false
      } catch {
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
        setOpenChatError(extractErrorMessage(res.data) ?? `Rückgängig machen fehlgeschlagen (HTTP ${res.status}).`)
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
    async (file: File, again?: { person: 'A' | 'B'; receiptId: string | null; kind: DetectedDocumentKind }): Promise<CaptureResult | null> => {
      if (!isAuthenticated) return null
      setParsingReceipt(true)
      setOpenChatError(null)
      setReceiptNotice(null)
      setCertificateOwnerFile(null)
      try {
        const result = await captureReceipt(file, {
          taxYear,
          onPhase: setReceiptPhase,
          ...(again ? { kind: again.kind, person: again.person, receiptId: again.receiptId } : {}),
        })
        if (!result.ok) {
          setReceiptNotice(tr(`advisor.chat.receiptFailure.${result.failure}`))
          return result
        }
        setLastParsedReceipt(result.response)
        // A certificate, LStB or letter whose name fits nobody waits for the user to say whose it is.
        const certificate = result.response.chLohnausweis ?? result.response.chLetter ?? null
        const owned = certificate ?? result.response.lstb ?? null
        const isLstb = certificate === null && result.response.lstb != null
        if (owned?.personUnclear) {
          setCertificateOwnerFile({ file, receiptId: result.receiptId, kind: result.kind })
          setReceiptNotice(tr(isLstb ? 'advisor.chat.lstbWhose' : result.response.chLetter ? 'advisor.chat.letterWhose' : 'advisor.chat.certificateWhose'))
        } else if (owned?.personNotRecordable) {
          setReceiptNotice(tr(isLstb ? 'advisor.chat.lstbPersonBOwnAccount' : 'advisor.chat.certificatePersonBOwnAccount'))
        }
        // A receipt that is read but records nothing (a cosmetic operation, an invoice counted already) says why.
        if (result.response.stagedAction == null && result.response.parsed.vendorCategory === 'krankheitskosten') {
          setReceiptNotice(result.response.parsed.summary)
        }
        const yearConflict = result.response.lstb?.yearConflict ?? certificate?.yearConflict ?? null
        if (yearConflict !== null) {
          setReceiptNotice(
            tr('advisor.chat.receiptYearConflict', {
              documentYear: yearConflict.documentYear,
              activeYear: yearConflict.activeYear,
            }),
          )
        }
        const stagedId = result.response.stagedAction?.actionId
        if (stagedId) {
          setReceiptLinkedActionIds((prev) => new Set(prev).add(stagedId))
        }
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getAdvisorControllerGetSessionQueryKey(taxYear) }),
          queryClient.invalidateQueries({ queryKey: getOwlModeControllerGetCardsQueryKey(taxYear) }),
          queryClient.invalidateQueries({ queryKey: getReceiptControllerListQueryKey() }),
        ])
        return result
      } catch {
        // Never leave the chat silent: any unexpected failure becomes a visible notice.
        setReceiptNotice(tr('advisor.chat.receiptFailure.parse_failed'))
        return null
      } finally {
        setParsingReceipt(false)
        setReceiptPhase(null)
      }
    },
    [isAuthenticated, queryClient, taxYear, tr],
  )

  const chooseCertificateOwner = useCallback(
    async (person: 'A' | 'B') => {
      if (certificateOwnerFile === null) return
      await captureReceiptFile(certificateOwnerFile.file, { person, receiptId: certificateOwnerFile.receiptId, kind: certificateOwnerFile.kind })
    },
    [captureReceiptFile, certificateOwnerFile],
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
      streamedReasoning,
      pendingUserMessage,
      reconnecting,
      conversationId,
      setConversationId,
      adoptConversationId,
      openConversationInYear,
      answeringConversationIds,
      resumeRun,
      basisMode,
      chatError,
      clearChatError: () => setOpenChatError(null),
      sendStreamingMessage,
      plan,
      stopStreaming,
      abortedTurn,
      clearAbortedTurn: () => setOpenAbortedTurn(null),
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
      captureReceiptFile,
      receiptPhase,
      receiptNotice,
      clearReceiptNotice: () => setReceiptNotice(null),
      certificateOwnerPending: certificateOwnerFile !== null,
      chooseCertificateOwner,
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
      streamedReasoning,
      pendingUserMessage,
      reconnecting,
      conversationId,
      setConversationId,
      adoptConversationId,
      openConversationInYear,
      answeringConversationIds,
      resumeRun,
      basisMode,
      chatError,
      sendStreamingMessage,
      plan,
      stopStreaming,
      abortedTurn,
      batchApplying,
      staleConflict,
      applyAllPending,
      applySingleAction,
      undoSingleAction,
      parsingReceipt,
      lastParsedReceipt,
      receiptLinkedActionIds,
      parseReceipt,
      captureReceiptFile,
      receiptPhase,
      receiptNotice,
      certificateOwnerFile,
      chooseCertificateOwner,
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
