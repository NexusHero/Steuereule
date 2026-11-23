import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { Screen } from '@steuereule/core'
import type { CopilotBridgeContextValue, CopilotBridgeProviderProps, CopilotMode, OwlViewMode } from './CopilotBridge.types'
import { useCopilotBridgeStreams } from './useCopilotBridgeStreams'
import { useCopilotBridgeReceipts } from './useCopilotBridgeReceipts'
import { useCopilotBridgeActions } from './useCopilotBridgeActions'
export type {
  AbortedTurn,
  AdvisorPlanView,
  ChatReceiptResult,
  CockpitBannerState,
  CopilotBridgeContextValue,
  CopilotBridgeProviderProps,
  CopilotMode,
  OwlViewMode,
  ParseReceiptInput,
  PlanStepView,
  SendStreamingOptions,
  StaleConflictState,
  StaleFieldConflict,
  StreamOutcome,
  TileProvenanceKind,
} from './CopilotBridge.types'
export { abortPlan } from './CopilotBridgeHelpers'
export { invalidateAllTaxQueries } from './CopilotBridgeQueries'

const CopilotBridgeContext = createContext<CopilotBridgeContextValue | null>(null)

export function CopilotBridgeProvider({
  mode,
  onModeChange,
  taxYear,
  onSwitchYear,
  isAuthenticated = true,
  children,
}: CopilotBridgeProviderProps) {
  const [owlViewMode, setOwlViewMode] = useState<OwlViewMode>({ kind: 'stage' })
  const switchTaxYear = useCallback((year: number) => onSwitchYear?.(year), [onSwitchYear])

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

  const {
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
  } = useCopilotBridgeStreams({ taxYear, isAuthenticated, onSwitchYear, openMaskPreview })
  const {
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
  } = useCopilotBridgeReceipts({ taxYear, isAuthenticated, setOpenChatError })
  const {
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
  } = useCopilotBridgeActions({ taxYear, isAuthenticated, onModeChange, setOwlViewMode, setOpenChatError, receiptLinkedActionIds })

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
      applyFailure,
      undoSingleAction,
      parsingReceipt,
      lastParsedReceipt,
      receiptLinkedActionIds,
      parseReceipt,
      captureReceiptFile,
      readStoredReceipt,
      receiptPhase,
      receiptNotice,
      clearReceiptNotice: () => setReceiptNotice(null),
      receiptResults,
      startReceiptBatch: () => setReceiptResults([]),
      clearReceiptResults: () => setReceiptResults([]),
      switchTaxYear,
      documentQuestion,
      documentHolder,
      assignmentBusy,
      assignmentError,
      chooseDocumentHolder,
      createDocumentHolder,
      confirmDocumentSelf,
      takeDocumentAlsoFor,
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
      applyFailure,
      undoSingleAction,
      parsingReceipt,
      lastParsedReceipt,
      receiptLinkedActionIds,
      parseReceipt,
      captureReceiptFile,
      readStoredReceipt,
      receiptPhase,
      receiptNotice,
      receiptResults,
      switchTaxYear,
      documentQuestion,
      documentHolder,
      assignmentBusy,
      assignmentError,
      chooseDocumentHolder,
      createDocumentHolder,
      confirmDocumentSelf,
      takeDocumentAlsoFor,
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
