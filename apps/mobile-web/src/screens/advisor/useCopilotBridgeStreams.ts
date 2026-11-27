import { apiFetch } from '../../net/apiFetch'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { foldThoughtEvent, type AdvisorChatMessageView, type AdvisorThoughtStep, type Screen } from '@steuereule/core'
import {
  advisorControllerGetSession,
  advisorControllerStopRun,
  getAdvisorControllerGetSessionQueryKey,
  getAdvisorControllerRunEventsUrl,
  getAdvisorControllerStreamMessageUrl,
  getApiClientBaseUrl,
  getOwlModeControllerGetCardsQueryKey,
  getOwlModeControllerGetSettingQueryKey,
  getAdvisorControllerListConversationsQueryKey,
  type SendAdvisorMessageResponseDto,
  ApiError,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { createFrameBatcher } from './chat/frameBatcher'
import { apiErrorText } from './chat/apiErrorText'
import { followRun, type RunFrame } from './chat/runStream'
import { owlAnswerArrived } from './owlUnread'
import { advisorFailureText } from './chat/advisorFailureText'
import type { AbortedTurn, AdvisorPlanView, SendStreamingOptions, StreamOutcome } from './CopilotBridge.types'
import {
  IDLE_STREAM,
  PENDING_CONVERSATION,
  abortPlan,
  answeringIds,
  parsePlanSteps,
  patchedStreams,
  streamMessageBody,
  streamsMovedFromPending,
  type ActiveRun,
  type ConversationStream,
  type StreamUpdate,
} from './CopilotBridgeHelpers'

export interface UseCopilotBridgeStreamsInput {
  readonly taxYear: number
  readonly isAuthenticated: boolean
  readonly onSwitchYear: ((year: number) => void) | undefined
  readonly openMaskPreview: (screen: Screen, field?: string) => void
}

/** The answers of every conversation: which one is open, what is streamed, stopped or failed, and following runs. */
export function useCopilotBridgeStreams({ taxYear, isAuthenticated, onSwitchYear, openMaskPreview }: UseCopilotBridgeStreamsInput) {
  const queryClient = useQueryClient()
  const { t: tr } = useTranslation(APP_NS)
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
    setStreams((prev) => patchedStreams(prev, key, field, update))
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
  const answeringConversationIds = useMemo(() => answeringIds(streams), [streams])

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
    setStreams((prev) => streamsMovedFromPending(prev, id))
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
          setChatError(apiErrorText(data) ?? tr('advisor.chat.turnFailed'))
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
            apiFetch(`${getApiClientBaseUrl()}${getAdvisorControllerRunEventsUrl(taxYear, runId)}`, {
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
          // Always in words: a refusal the user cannot read helps nobody (real-data run, finding 5).
          // WEB-14: a 429 says when to retry, a 5xx is ours, a lapsed session is handled centrally; never raw text.
          const refusal = new ApiError(result.status, result.body)
          setChatError(advisorFailureText(refusal, tr, { unknown: tr('advisor.chat.requestRefused'), validation: tr('advisor.chat.requestRefused') }))
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
        // The answer is there: the navigation marks the owl if the user is on another tab by now, and
        // asks the server again, which keeps the mark for a later visit.
        owlAnswerArrived()
        void queryClient.invalidateQueries({ queryKey: getAdvisorControllerListConversationsQueryKey(taxYear) })
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
        // WEB-14: never "Failed to fetch" in the German UI.
        setChatError(advisorFailureText(error, tr, { unknown: tr('advisor.chat.connectionLost') }))
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
        apiFetch(`${getApiClientBaseUrl()}${getAdvisorControllerStreamMessageUrl(taxYear)}`, {
          method: 'POST',
          signal,
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify(streamMessageBody(message, activeScreen, options, conversationIdRef.current)),
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
          apiFetch(`${getApiClientBaseUrl()}${getAdvisorControllerRunEventsUrl(taxYear, runId)}`, {
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
          const running = session.data.messages.find((m) => m.status === 'streaming')
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

  return {
    streaming,
    streamSteps,
    streamedText,
    streamedReasoning,
    chatError,
    abortedTurn,
    plan,
    pendingUserMessage,
    reconnecting,
    answeringConversationIds,
    basisMode,
    conversationId,
    setConversationId,
    adoptConversationId,
    openConversationInYear,
    setOpenChatError,
    setOpenAbortedTurn,
    sendStreamingMessage,
    resumeRun,
    stopStreaming,
  }
}
