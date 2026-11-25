import { useEffect, useRef, useState } from 'react'
import { useWindowDimensions } from 'react-native'
import { useBreakpoint } from '@steuereule/ui'
import { conflictingAlternatives, evaluateAdvisorTurn, type AdvisorChatMessageView, type OwlCardsDisplay, type Screen } from '@steuereule/core'
import { readOwlPanelWidth, readOwlSidebarOpen } from '../../lib/owlSidebarPreference'
import { useOptionalCopilotBridge, type OwlViewMode } from './CopilotBridgeProvider'
import type { ChatSendOptions } from './AdvisorChatPanel'
import { extractAppliedDrafts, extractPendingDrafts, updateActionStatusInMessage } from './owlDrafts'
import type { OwlModeScreenProps } from './OwlModeScreen'
import { attentionGrew, localDigest, messagesBefore, supersededBy } from './OwlModeHelpers'

export type UseOwlModeScreenInput = Pick<
  OwlModeScreenProps,
  | 'initialMessages'
  | 'onDismissCard'
  | 'onSendMessage'
  | 'onApplyAction'
  | 'onUndoAction'
  | 'onDismissAction'
  | 'onClearConversation'
  | 'onSearchConversations'
  | 'situation'
  | 'onSaveSituation'
  | 'notes'
  | 'onAddNote'
  | 'onEditNote'
  | 'onDeleteNote'
> & {
  readonly onDone: () => void
  readonly taxYear: number
  readonly initialCards: readonly OwlCardsDisplay[]
}

/** The owl screen's state: panels and sheets, the local preview chat, drafts, and following a running answer. */
export function useOwlModeScreen({
  onDone,
  taxYear,
  initialCards,
  initialMessages,
  onDismissCard,
  onSendMessage,
  onApplyAction,
  onUndoAction,
  onDismissAction,
  onClearConversation,
  onSearchConversations,
  situation,
  onSaveSituation,
  notes,
  onAddNote,
  onEditNote,
  onDeleteNote,
}: UseOwlModeScreenInput) {
  const bp = useBreakpoint()
  const bridge = useOptionalCopilotBridge()

  // null: the workbench follows what needs attention; otherwise the reader's own choice stands.
  const [panelChoice, setPanelChoice] = useState<'open' | 'closed' | null>(null)
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [connectionOpen, setConnectionOpen] = useState(false)
  const [rechecking, setRechecking] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [conversationsOpen, setConversationsOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [situationOpen, setSituationOpen] = useState(false)
  const [sessionSummaryOpen, setSessionSummaryOpen] = useState(false)
  const [workbenchTab, setWorkbenchTab] = useState<'drafts' | 'forms'>('drafts')

  // Cmd/Ctrl+K opens the search, as in Claude.
  useEffect(() => {
    if (!onSearchConversations || typeof window === 'undefined') return
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onSearchConversations])
  // Desktop: the conversations and notes sit in a sidebar that remembers whether it was collapsed.
  const [sidebarOpen, setSidebarOpen] = useState(readOwlSidebarOpen)
  // The user drags the lines next to the chat: the side panels give way, the chat gets the room.
  const [sidebarWidth, setSidebarWidth] = useState(() => readOwlPanelWidth('sidebar'))
  const [workbenchWidth, setWorkbenchWidth] = useState(() => readOwlPanelWidth('workbench'))
  const { width: windowWidth } = useWindowDimensions()
  const [clearState, setClearState] = useState<'closed' | 'confirm' | 'clearing' | 'failed'>('closed')
  const [cards, setCards] = useState<readonly OwlCardsDisplay[]>(initialCards)
  const [activeIndex, setActiveIndex] = useState(0)
  const [localMessages, setLocalMessages] = useState<readonly AdvisorChatMessageView[]>(initialMessages ?? [])
  const [localViewMode, setLocalViewMode] = useState<OwlViewMode>({ kind: 'stage' })
  const [isSending, setIsSending] = useState(false)
  const nextLocalMsgIdRef = useRef(1)

  const displayedMessages = initialMessages ?? localMessages
  const activeCard = cards[activeIndex]
  const pendingDrafts = extractPendingDrafts(displayedMessages)
  const appliedDrafts = extractAppliedDrafts(displayedMessages)
  // Alternatives (two ways to fill one thing) are never applied together: the user picks one (K1).
  const alternativeGroups = conflictingAlternatives(pendingDrafts)
  const alternativeIds = new Set(alternativeGroups.flatMap((group) => group.map((d) => d.actionId)))
  const viewMode = bridge ? bridge.owlViewMode : localViewMode
  // With the bridge every conversation has its own answer (#503): the open one is busy only while
  // its own answer is written, whatever is running elsewhere.
  // The screen's own flag covers the whole screen, so it only counts where no bridge follows the answer.
  const effectiveSending = bridge && bridge.isAuthenticated ? bridge.streaming : isSending

  // The workbench opens by itself only when there is something to check: on a wide screen for
  // drafts and masks, on a narrow one only for a mask the reader asked to see, because there it
  // covers the chat (#476 decision 2).
  const wide = bp === 'l'
  const needsAttention = viewMode.kind === 'mask' || (wide && pendingDrafts.length > 0) || (wide && Boolean(bridge?.staleConflict))
  const panelOpen = panelChoice === null ? needsAttention : panelChoice === 'open'
  const openMask = viewMode.kind === 'mask' ? viewMode.screen : null
  const draftCount = pendingDrafts.length
  const seenAttention = useRef({ mask: openMask, drafts: draftCount })
  useEffect(() => {
    // Only something new to check (another mask, one more draft) overrides the reader's own choice;
    // going back from a mask or applying a draft never closes or reopens the workbench by itself.
    const seen = seenAttention.current
    const grew = attentionGrew(seen, openMask, draftCount, wide)
    seenAttention.current = { mask: openMask, drafts: draftCount }
    if (grew) setPanelChoice(null)
  }, [openMask, draftCount, wide])

  // An answer that is still being written (after a reload, or on another device) is followed again.
  const runningRunId = displayedMessages.find((m) => m.role === 'assistant' && m.status === 'streaming')?.runId
  const resumeRun = bridge?.resumeRun
  const bridgeStreaming = bridge?.streaming ?? false
  useEffect(() => {
    if (resumeRun && runningRunId !== undefined && !bridgeStreaming) void resumeRun(runningRunId)
  }, [resumeRun, runningRunId, bridgeStreaming])

  function closePanel() {
    if (viewMode.kind === 'mask') handleReturnToStage()
    setPanelChoice('closed')
  }

  async function confirmClear() {
    if (!onClearConversation) return
    setClearState('clearing')
    try {
      await onClearConversation()
      setLocalMessages([])
      setClearState('closed')
      setSettingsOpen(false)
    } catch {
      setClearState('failed')
    }
  }

  function handleInspectMask(screen: Screen, field?: string) {
    if (bridge) {
      bridge.openMaskPreview(screen, field)
      return
    }
    setLocalViewMode(field === undefined ? { kind: 'mask', screen } : { kind: 'mask', screen, field })
  }

  function handleReturnToStage() {
    if (bridge) {
      bridge.returnToStage()
      return
    }
    setLocalViewMode({ kind: 'stage' })
  }

  async function handleDismiss(fingerprint: string) {
    // NR-05: a card the server did not hide stays (the failure is reported by the caller).
    if (onDismissCard) {
      try {
        await onDismissCard(fingerprint)
      } catch {
        return
      }
    }
    const fresh = cards.filter((k) => k.fingerprint !== fingerprint)
    setCards(fresh)
    if (activeIndex >= fresh.length && fresh.length > 0) {
      setActiveIndex(fresh.length - 1)
    }
  }

  /** False when the message did not reach the owl, so the composer keeps it (WEB-14). */
  async function handleSendChat(text: string, options?: ChatSendOptions): Promise<boolean> {
    setIsSending(true)
    try {
      if (onSendMessage) {
        return (await onSendMessage(text, options)) !== false
      }
      // Regenerate / edit locally: the replaced turn leaves the chat before the new one is added.
      const replaceFrom = options?.replaceFromMessageId
      if (replaceFrom !== undefined) {
        setLocalMessages((prev) => messagesBefore(prev, replaceFrom))
      }
      if (bridge && bridge.isAuthenticated) {
        const res = await bridge.sendStreamingMessage(
          text,
          viewMode.kind === 'mask' ? viewMode.screen : undefined,
          options,
        )
        // A stopped answer stays stopped: no local stand-in reply (#451 decision 2).
        if (res === 'aborted') return true
        if (res && res.length > 0) {
          setLocalMessages((prev) => [...prev, ...res])
          return true
        }
      }
      const userMsg: AdvisorChatMessageView = {
        id: `msg-u-${nextLocalMsgIdRef.current++}`,
        role: 'user',
        content: text,
        meta: null,
        createdAt: new Date().toISOString(),
      }
      const turn = evaluateAdvisorTurn({
        message: text,
        digest: localDigest(taxYear, cards),
      })
      const assistantMsg: AdvisorChatMessageView = {
        id: `msg-a-${nextLocalMsgIdRef.current++}`,
        role: 'assistant',
        content: turn.replyText,
        meta: turn.meta,
        createdAt: new Date().toISOString(),
      }
      setLocalMessages((prev) => [...prev, userMsg, assistantMsg])
      return true
    } finally {
      setIsSending(false)
    }
  }

  async function handleClarifyCardWithEule(card: OwlCardsDisplay) {
    // On a narrow screen the workbench covers the chat: step aside so the answer can be read.
    if (!wide) setPanelChoice('closed')
    await handleSendChat(`${card.title}: ${card.message}`)
  }

  async function handleApplyAction(actionId: string) {
    if (onApplyAction) {
      await onApplyAction(actionId)
      return
    }
    if (bridge) {
      const ok = await bridge.applySingleAction(actionId)
      if (!ok) return
    }
    // Applying one alternative drops the others; the server marks them superseded the same way.
    const dropped = supersededBy(pendingDrafts, actionId)
    setLocalMessages((prev) =>
      prev.map((m) => dropped.reduce((msg, d) => updateActionStatusInMessage(msg, d.actionId, 'superseded'), updateActionStatusInMessage(m, actionId, 'applied'))),
    )
  }

  async function handleUndoAction(actionId: string) {
    if (onUndoAction) {
      await onUndoAction(actionId)
      return
    }
    if (bridge) {
      const ok = await bridge.undoSingleAction(actionId)
      if (!ok) return
    }
    setLocalMessages((prev) => prev.map((m) => updateActionStatusInMessage(m, actionId, 'undone')))
  }

  async function handleDismissAction(actionId: string) {
    // NR-05: a draft the server did not dismiss stays open (the failure is reported by the caller).
    if (onDismissAction) {
      try {
        await onDismissAction(actionId)
      } catch {
        return
      }
    }
    setLocalMessages((prev) => prev.map((m) => updateActionStatusInMessage(m, actionId, 'dismissed')))
  }

  async function handleBatchApply(acceptCurrentValues = false) {
    if (pendingDrafts.length === 0 || alternativeGroups.length > 0) return
    if (bridge) {
      const acknowledgedConflict = acceptCurrentValues ? (bridge.staleConflict ?? undefined) : undefined
      const ok = await bridge.applyAllPending(pendingDrafts, { stay: true, ...(acknowledgedConflict ? { acknowledgedConflict } : {}) })
      if (ok) {
        for (const d of pendingDrafts) {
          setLocalMessages((prev) => prev.map((m) => updateActionStatusInMessage(m, d.actionId, 'applied')))
        }
      }
      return
    }
    for (const d of pendingDrafts) {
      await handleApplyAction(d.actionId)
    }
    onDone()
  }

  const handleAttachReceipt = bridge
    ? async (input: { readonly fileName: string; readonly rawText: string }) => {
        await bridge.parseReceipt({ fileName: input.fileName, rawText: input.rawText, stageDraft: true })
      }
    : undefined

  /** What the owl knows about the household and this year: behind the chip in the composer. */
  const hasSituationDialog = (situation !== undefined && onSaveSituation !== undefined) || (notes !== undefined && onAddNote !== undefined && onEditNote !== undefined && onDeleteNote !== undefined)

  return {
    bp,
    bridge,
    wide,
    panelOpen,
    setPanelChoice,
    privacyOpen,
    setPrivacyOpen,
    connectionOpen,
    setConnectionOpen,
    rechecking,
    setRechecking,
    settingsOpen,
    setSettingsOpen,
    conversationsOpen,
    setConversationsOpen,
    searchOpen,
    setSearchOpen,
    situationOpen,
    setSituationOpen,
    sessionSummaryOpen,
    setSessionSummaryOpen,
    workbenchTab,
    setWorkbenchTab,
    sidebarOpen,
    setSidebarOpen,
    sidebarWidth,
    setSidebarWidth,
    workbenchWidth,
    setWorkbenchWidth,
    windowWidth,
    clearState,
    setClearState,
    cards,
    activeIndex,
    setActiveIndex,
    activeCard,
    displayedMessages,
    pendingDrafts,
    appliedDrafts,
    alternativeGroups,
    alternativeIds,
    viewMode,
    effectiveSending,
    closePanel,
    confirmClear,
    handleInspectMask,
    handleReturnToStage,
    handleDismiss,
    handleSendChat,
    handleClarifyCardWithEule,
    handleApplyAction,
    handleUndoAction,
    handleDismissAction,
    handleBatchApply,
    handleAttachReceipt,
    hasSituationDialog,
  }
}

export type OwlModeScreenState = ReturnType<typeof useOwlModeScreen>
