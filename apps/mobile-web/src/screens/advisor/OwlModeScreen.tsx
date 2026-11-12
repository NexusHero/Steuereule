import { useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { AiChip, Button, Card, Chip, Option, Sheet, useBreakpoint, useTheme } from '@steuereule/ui'
import {
  evaluateAdvisorTurn,
  formatEuro,
  LEGAL_STATUS_DATE,
  type AdvisorChatMessageView,
  type AdvisorFeedbackRating,
  type AdvisorFeedbackReason,
  type CaseDigest,
  type OwlCardsDisplay,
  type Profession,
  type Screen,
} from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'
import { OwlTopBar } from './OwlTopBar'
import { ProfessionPicker } from './ProfessionPicker'
import { AdvisorChatPanel, type AdvisorChatPanelProps, type ChatSendOptions } from './AdvisorChatPanel'
import { ConversationList, type ConversationSearchHit, type ConversationSummary } from './chat/ConversationList'
import { ProjectNotes, type ProjectNote } from './chat/ProjectNotes'
import { ConnectionDetails, type ConnectionView } from './chat/ConnectionStatus'
import { readOwlSidebarOpen, writeOwlSidebarOpen } from '../../lib/owlSidebarPreference'
import { useOptionalCopilotBridge, type OwlViewMode } from './CopilotBridgeProvider'
import { GuestOwlGate } from './OwlGuestGate'
import { InlineMaskView } from './OwlInlineMask'
import { extractPendingDrafts, updateActionStatusInMessage } from './owlDrafts'
import { makeStyles } from './OwlModeScreen.styles'
import { ConnectedOwlModeScreen } from './OwlModeScreen.connected'
export { makeStyles } from './OwlModeScreen.styles'

export interface OwlModeScreenProps {
  readonly onDone?: () => void
  readonly onBack?: () => void
  readonly taxYear?: number
  readonly initialCards?: readonly OwlCardsDisplay[] | undefined
  readonly initialMessages?: readonly AdvisorChatMessageView[] | undefined
  readonly onDismissCard?: ((fingerprint: string) => Promise<void> | void) | undefined
  readonly onAcceptPath?: ((cardId: string, pathIndex: number) => void) | undefined
  readonly optInEnabled?: boolean | undefined
  readonly onToggleOptIn?: ((enabled: boolean) => Promise<void> | void) | undefined
  /** The interview's occupation group; null = not chosen yet, undefined = no picker (not loaded). */
  readonly profession?: Profession | null | undefined
  readonly onChooseProfession?: ((profession: Profession) => Promise<void> | void) | undefined
  readonly onSendMessage?: ((text: string, options?: ChatSendOptions) => Promise<void> | void) | undefined
  readonly onApplyAction?: ((actionId: string) => Promise<void> | void) | undefined
  readonly onUndoAction?: ((actionId: string) => Promise<void> | void) | undefined
  /** Stores a thumbs up/down for an answer; without it the chat offers no rating. */
  readonly onRateMessage?:
    | ((messageId: string, rating: AdvisorFeedbackRating | null, reason?: AdvisorFeedbackReason) => Promise<void> | void)
    | undefined
  /** Deletes this year's conversation on the server; rejects when it could not. */
  readonly onClearConversation?: (() => Promise<void>) | undefined
  /** The conversations of this tax year (#481); without them the screen shows no list. */
  readonly conversations?: readonly ConversationSummary[] | undefined
  readonly activeConversationId?: string | null | undefined
  readonly onSelectConversation?: ((id: string) => void) | undefined
  readonly onNewConversation?: (() => Promise<void>) | undefined
  readonly onRenameConversation?: ((id: string, title: string) => Promise<void>) | undefined
  readonly onDeleteConversation?: ((id: string) => Promise<void>) | undefined
  readonly onSearchConversations?: ((query: string) => Promise<readonly ConversationSearchHit[]>) | undefined
  /** How full the context of the open conversation is (#481). */
  readonly context?: AdvisorChatPanelProps['context']
  readonly onSummarize?: (() => Promise<void>) | undefined
  /** The status of the connection to the model and the server (#488); without it the top bar shows none. */
  readonly connection?: ConnectionView | undefined
  readonly onRecheckConnection?: (() => Promise<unknown> | void) | undefined
  /** The project notes of this tax year (#481); without them the screen shows no notes. */
  readonly notes?: readonly ProjectNote[] | undefined
  readonly onAddNote?: ((text: string) => Promise<void>) | undefined
  readonly onEditNote?: ((id: string, text: string) => Promise<void>) | undefined
  readonly onDeleteNote?: ((id: string) => Promise<void>) | undefined
  readonly onUndoNoteChange?: ((messageId: string, index: number) => Promise<void>) | undefined
  readonly isGuest?: boolean | undefined
  readonly onRegister?: (() => void) | undefined
  readonly onLogin?: (() => void) | undefined
}

export const AI_MANUAL_ONLY_SCREENS: ReadonlySet<Screen> = new Set<Screen>(['profil', 'stammdaten', 'kopplung'])

const DEFAULT_LOCAL_DIGEST: CaseDigest = {
  taxYear: CURRENT_TAX_YEAR,
  filingStatus: 'einzel',
  lstbPersonA: { grossWageEur: 62000, wageTaxEur: 11800, socialSecurityEur: 11400 },
  crossBorder: {
    isCrossBorderCh: false,
    grossWageChf: null,
    withholdingTaxChf: null,
    pillar3aChf: null,
    healthInsuranceChf: null,
    dailySicknessBenefitChf: null,
    nonReturnDays: null,
  },
  commuteAndWorkdays: {
    workdays: 220,
    homeOfficeAnswer: 'Nie',
    homeOfficeDays: 0,
    distanceKm: 18,
  },
  catalogExpenses: {
    hasTraining: false,
    relocationCostsEur: null,
    donationsEur: null,
    selfPaidKvPvEur: null,
    riesterEur: null,
    doubleHouseholdRentEur: null,
  },
  childrenCount: 0,
  rentalObjectsCount: 0,
  capitalGainEur: null,
  priorYearComparison: { donationsEur: 200 },
  openOwlHints: [],
  printoutMissingFields: ['stammdaten.iban'],
  estimatedRefundEur: 480,
}

export function OwlModeScreen(props: OwlModeScreenProps) {
  const bridge = useOptionalCopilotBridge()
  const blockedAsGuest = props.isGuest === true || bridge?.isAuthenticated === false
  if (blockedAsGuest && props.initialCards === undefined) {
    return <GuestOwlGate {...props} />
  }
  if (props.initialCards !== undefined) {
    return <OwlModeScreenView {...props} initialCards={props.initialCards} />
  }
  return <ConnectedOwlModeScreen {...props} />
}

export function OwlModeScreenView({
  onDone = () => {},
  onBack,
  taxYear = CURRENT_TAX_YEAR,
  initialCards = [],
  initialMessages,
  onDismissCard,
  onAcceptPath,
  optInEnabled = true,
  onToggleOptIn,
  profession,
  onChooseProfession,
  onSendMessage,
  onApplyAction,
  onUndoAction,
  onRateMessage,
  onClearConversation,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  onRenameConversation,
  onDeleteConversation,
  onSearchConversations,
  context,
  onSummarize,
  connection,
  onRecheckConnection,
  notes,
  onAddNote,
  onEditNote,
  onDeleteNote,
  onUndoNoteChange,
}: OwlModeScreenProps & { readonly initialCards: readonly OwlCardsDisplay[] }) {
  const bp = useBreakpoint()
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const bridge = useOptionalCopilotBridge()

  // null: the workbench follows what needs attention; otherwise the reader's own choice stands.
  const [panelChoice, setPanelChoice] = useState<'open' | 'closed' | null>(null)
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [connectionOpen, setConnectionOpen] = useState(false)
  const [rechecking, setRechecking] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [conversationsOpen, setConversationsOpen] = useState(false)
  // Desktop: the conversations and notes sit in a sidebar that remembers whether it was collapsed.
  const [sidebarOpen, setSidebarOpen] = useState(readOwlSidebarOpen)
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
  const viewMode = bridge ? bridge.owlViewMode : localViewMode
  const effectiveSending = isSending || (bridge?.streaming ?? false)

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
    const grew = (openMask !== null && openMask !== seen.mask) || (wide && draftCount > seen.drafts)
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
    if (onDismissCard) await onDismissCard(fingerprint)
    const fresh = cards.filter((k) => k.fingerprint !== fingerprint)
    setCards(fresh)
    if (activeIndex >= fresh.length && fresh.length > 0) {
      setActiveIndex(fresh.length - 1)
    }
  }

  async function handleSendChat(text: string, options?: ChatSendOptions) {
    setIsSending(true)
    try {
      if (onSendMessage) {
        await onSendMessage(text, options)
        return
      }
      // Regenerate / edit locally: the replaced turn leaves the chat before the new one is added.
      const replaceFrom = options?.replaceFromMessageId
      if (replaceFrom !== undefined) {
        setLocalMessages((prev) => {
          const at = prev.findIndex((m) => m.id === replaceFrom)
          return at === -1 ? prev : prev.slice(0, at)
        })
      }
      if (bridge && bridge.isAuthenticated) {
        const res = await bridge.sendStreamingMessage(
          text,
          viewMode.kind === 'mask' ? viewMode.screen : undefined,
          options,
        )
        // A stopped answer stays stopped: no local stand-in reply (#451 decision 2).
        if (res === 'aborted') return
        if (res && res.length > 0) {
          setLocalMessages((prev) => [...prev, ...res])
          return
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
        digest: {
          ...DEFAULT_LOCAL_DIGEST,
          taxYear,
          openOwlHints: cards.map((c) => ({
            id: c.id,
            fingerprint: c.fingerprint,
            title: c.title,
            message: c.message,
            sourceId: 'estg-9-1',
            amountEur: c.amountEur,
          })),
        },
      })
      const assistantMsg: AdvisorChatMessageView = {
        id: `msg-a-${nextLocalMsgIdRef.current++}`,
        role: 'assistant',
        content: turn.replyText,
        meta: turn.meta,
        createdAt: new Date().toISOString(),
      }
      setLocalMessages((prev) => [...prev, userMsg, assistantMsg])
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
    setLocalMessages((prev) => prev.map((m) => updateActionStatusInMessage(m, actionId, 'applied')))
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

  async function handleBatchApply(acceptCurrentValues = false) {
    if (pendingDrafts.length === 0) return
    if (bridge) {
      const acknowledgedConflict = acceptCurrentValues ? (bridge.staleConflict ?? undefined) : undefined
      const ok = await bridge.applyAllPending(pendingDrafts, acknowledgedConflict ? { acknowledgedConflict } : undefined)
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

  function renderChatPanel(compact = false) {
    return (
      <AdvisorChatPanel
        messages={displayedMessages}
        quickChips={[
          { label: tr('advisor.chat.forgottenChip'), testID: 'advisor-chip-vergessen', quickAction: 'forgotten_check' },
          'Kanzlei-Endprüfung starten',
          'Homeoffice vs. Arbeitszimmer prüfen',
          'Fortbildung & Reisekosten klären',
          'Spenden aus dem Vorjahr prüfen',
        ]}
        isSending={effectiveSending}
        context={context}
        onSummarize={onSummarize}
        onUndoNoteChange={onUndoNoteChange}
        streamSteps={bridge?.streamSteps}
        streamedText={bridge?.streamedText}
        streamedReasoning={bridge?.streamedReasoning}
        pendingUserMessage={bridge?.pendingUserMessage}
        reconnecting={bridge?.reconnecting}
        onRateMessage={onRateMessage}
        variant="page"
        chatError={bridge?.chatError}
        basisMode={bridge?.basisMode}
        onSendMessage={handleSendChat}
        onStop={bridge?.stopStreaming}
        abortedTurn={bridge?.abortedTurn}
        plan={bridge?.plan}
        onApplyAction={handleApplyAction}
        onUndoAction={handleUndoAction}
        onInspectMask={handleInspectMask}
        receiptLinkedActionIds={bridge?.receiptLinkedActionIds}
        onAttachReceipt={handleAttachReceipt}
        // The promise is handed on: the chat reads several files one after another and has to know when one is done.
        onAttachReceiptFile={bridge ? async (file) => void (await bridge.captureReceiptFile(file)) : undefined}
        receiptProgress={bridge?.receiptPhase ? tr(`advisor.chat.receiptProgress.${bridge.receiptPhase}`) : null}
        receiptNotice={bridge?.receiptNotice ?? null}
        isParsingReceipt={bridge?.parsingReceipt}
        compact={compact}
      />
    )
  }

  function renderSettings() {
    return (
      <View style={styles.sheetBody}>
        <Text style={styles.sheetTitle} role="heading" aria-level={2}>
          {tr('eule.workspace.topbar.settingsTitle')}
        </Text>
        {profession !== undefined && onChooseProfession ? (
          <ProfessionPicker profession={profession} onChoose={onChooseProfession} />
        ) : null}

        {onToggleOptIn ? (
          <Option selected={optInEnabled} onPress={() => void onToggleOptIn(!optInEnabled)} testID="eulen-modus-opt-in">
            {tr('eule.optInLabel', 'Eulen-Modus aktivieren (proaktive Hinweise ab 50 €, keine personenbezogenen Daten an KI)')}
          </Option>
        ) : null}

        {onClearConversation ? (
          clearState === 'closed' ? (
            <Button
              variant="leise"
              onPress={() => setClearState('confirm')}
              disabled={effectiveSending || displayedMessages.length === 0}
              testID="eule-clear-conversation-btn"
            >
              {tr('advisor.chat.clear.button')}
            </Button>
          ) : (
            <Card style={styles.clearCard} testID="eule-clear-confirm">
              <Text style={styles.clearTitle}>{tr('advisor.chat.clear.confirmTitle')}</Text>
              <Text style={styles.help}>{tr('advisor.chat.clear.confirmBody')}</Text>
              {clearState === 'failed' ? (
                <Text style={styles.conflictText} role="alert" testID="eule-clear-failed">
                  {tr('advisor.chat.clear.failed')}
                </Text>
              ) : null}
              <View style={styles.conflictActions}>
                <Button onPress={() => void confirmClear()} disabled={clearState === 'clearing'} style={{ flex: 1 }} testID="eule-clear-confirm-btn">
                  {tr('advisor.chat.clear.confirm')}
                </Button>
                <Button variant="ghost" onPress={() => setClearState('closed')} style={{ flex: 1 }} testID="eule-clear-cancel-btn">
                  {tr('advisor.chat.clear.cancel')}
                </Button>
              </View>
            </Card>
          )
        ) : null}
      </View>
    )
  }

  function renderWorkbenchBody() {
    if (viewMode.kind === 'mask') {
      return (
        <InlineMaskView
          screen={viewMode.screen}
          field={viewMode.field}
          taxYear={taxYear}
          onBack={() => {
            // Back from a mask means back to the drafts, not out of the workbench.
            setPanelChoice('open')
            handleReturnToStage()
          }}
          styles={styles}
        />
      )
    }

    return (
      <>
        {bridge?.lastParsedReceipt ? (
          <Card variant="ai" style={styles.receiptResultCard} testID="eule-receipt-result">
            <Text style={styles.draftSectionTitle}>
              {tr('eule.workspace.receiptResultTitle', {
                fileName: bridge.lastParsedReceipt.parsed.suggestedField ?? bridge.lastParsedReceipt.parsed.vendorCategory,
                defaultValue: `Beleg geprüft: ${bridge.lastParsedReceipt.parsed.vendorCategory}`,
              })}
            </Text>
            <Text style={styles.help}>{bridge.lastParsedReceipt.parsed.summary}</Text>
            {bridge.lastParsedReceipt.securityBlocked ? (
              <Text style={styles.conflictText}>
                {tr('eule.workspace.receiptBlocked', '⚠️ Sensibler Inhalt geschwärzt (Mandantengeheimnis)')}
              </Text>
            ) : null}
          </Card>
        ) : null}

        {bridge?.staleConflict ? (
          <Card variant="default" style={styles.conflictCard} testID="eule-stale-conflict-banner">
            <Text style={styles.conflictTitle}>{tr('eule.workspace.conflictTitle', '⚠️ Konflikt beim Übernehmen')}</Text>
            <Text style={styles.conflictText}>{bridge.staleConflict.message}</Text>
            <View style={styles.conflictActions}>
              <Button
                onPress={() => void handleBatchApply(true)}
                disabled={bridge.batchApplying}
                style={{ flex: 1 }}
                testID="eule-force-apply-btn"
              >
                {tr('eule.workspace.forceApply', 'Mit neuem Stand trotzdem übernehmen')}
              </Button>
              <Button
                variant="ghost"
                onPress={() => bridge.clearStaleConflict()}
                style={{ flex: 1 }}
                testID="eule-conflict-dismiss-btn"
              >
                {tr('eule.workspace.dismissConflict', 'Schließen')}
              </Button>
            </View>
          </Card>
        ) : null}

        {pendingDrafts.length > 0 ? (
          <Card variant="ai" style={styles.draftStageCard} testID="eule-draft-stage">
            <Text style={styles.draftSectionTitle}>
              {tr('eule.workspace.draftStageTitle', {
                count: pendingDrafts.length,
                defaultValue: `Vorbereitete Änderungen (${pendingDrafts.length})`,
              })}
            </Text>
            <View style={styles.draftList}>
              {pendingDrafts.map((draft) => {
                const isReceipt = bridge?.receiptLinkedActionIds.has(draft.actionId) ?? false
                const isZeroPauschbetrag =
                  draft.deltaEur === 0 && (draft.sourceId.startsWith('estg-9') || draft.sourceId === 'estg-4-5-6c')
                return (
                  <View key={draft.actionId} style={styles.draftRowCard} testID={`draft-card-${draft.actionId}`}>
                    <View style={styles.draftTopRow}>
                      <Text style={styles.draftTitle}>{draft.label}</Text>
                      {draft.deltaEur > 0 ? (
                        <Text style={styles.draftDelta}>{`+${formatEuro(draft.deltaEur)}`}</Text>
                      ) : isZeroPauschbetrag ? (
                        <Text style={styles.draftMutedBadge}>
                          {tr('eule.workspace.pauschbetragBadge', 'Im Pauschbetrag (1.230 €)')}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={styles.draftProvenance}>
                      {isReceipt
                        ? tr('eule.workspace.provenanceReceiptOwl', '📎 Beleg + Eule')
                        : tr('eule.workspace.provenanceOwlDraft', '🦉 Eulen-Entwurf')}
                    </Text>
                    <Text style={styles.draftDiff}>
                      {`${draft.previousValue ?? tr('advisor.chat.notRecorded', 'Nicht erfasst')} → ${draft.newValue}`}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => handleInspectMask(draft.screen, draft.field)}
                      style={styles.inspectMaskLink}
                      testID={`draft-inspect-${draft.actionId}`}
                    >
                      <Text style={styles.inspectMaskLinkText}>
                        {tr('eule.workspace.inspectMask', 'Maske ansehen →')}
                      </Text>
                    </Pressable>
                  </View>
                )
              })}
            </View>
            <Button
              onPress={() => void handleBatchApply(false)}
              disabled={bridge?.batchApplying ?? false}
              testID="eule-batch-apply-btn"
            >
              {bridge?.batchApplying
                ? tr('eule.workspace.applying', 'Wird übernommen …')
                : pendingDrafts.length === 1
                  ? tr('eule.workspace.applyOne', '✓ Änderung übernehmen & ins Cockpit')
                  : tr('eule.workspace.applyAll', {
                      count: pendingDrafts.length,
                      defaultValue: `✓ ${pendingDrafts.length} Änderungen übernehmen & ins Cockpit`,
                    })}
            </Button>
          </Card>
        ) : null}

        {cards.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{tr('eule.emptyTitle', 'Alles geprüft. Keine offenen Fragen!')}</Text>
            <Text style={styles.emptyHelp}>
              {tr(
                'eule.emptyHelp',
                'Deine Angaben sind schlüssig. Sobald neue Belege oder Gesetzesänderungen vorliegen, meldet sich die Eule wieder.',
              )}
            </Text>
            <Text style={styles.rechtsstand}>{tr('eule.rechtsstand', 'Rechtsstand: 01.01.2025 · Zuletzt geprüft: heute')}</Text>
          </Card>
        ) : activeCard ? (
          <View>
            <Text style={styles.counter}>
              {tr('eule.counter', { current: activeIndex + 1, total: cards.length, defaultValue: `Frage ${activeIndex + 1} von ${cards.length}` })}
            </Text>
            <Card style={styles.kiCard}>
              <AiChip style={styles.sender} testID="eule-sender-card">{tr('eule.sender', 'Die Eule')}</AiChip>
              <View style={styles.cardHeader}>
                <Chip active>{activeCard.title}</Chip>
                {activeCard.amountEur !== null && (
                  <Text style={styles.betragBadge}>{`+${formatEuro(activeCard.amountEur)}`}</Text>
                )}
              </View>

              <Text style={styles.botschaft}>{activeCard.message}</Text>
              <Text style={styles.begruendung}>{activeCard.reason}</Text>

              {activeCard.paths && (
                <View style={styles.wegeBlock}>
                  <Text style={styles.wegeTitle}>{tr('eule.wegeTitle', 'Empfohlene Vorgehensweise (StBerG-Grenze):')}</Text>
                  {activeCard.paths.map((path, idx) => (
                    <Pressable
                      key={path.name}
                      accessibilityRole="button"
                      onPress={() => onAcceptPath?.(activeCard.id, idx)}
                      style={[styles.wegOption, path.risk === 'sicher' ? styles.wegSicher : styles.wegRisiko]}
                    >
                      <View style={styles.wegHeader}>
                        <Text style={styles.wegName}>{path.name}</Text>
                        <Text style={styles.wegBetrag}>{formatEuro(path.amountEur)}</Text>
                      </View>
                      <Text style={styles.wegDesc}>{path.description}</Text>
                      <Text style={styles.wegBadge}>
                        {path.risk === 'sicher' ? '✓ Sicherer Weg' : '⚠ Riskanterer Weg'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}

              <View style={styles.quelleRow}>
                <Text style={styles.quelleText}>{activeCard.sourceTranslated}</Text>
              </View>

              <View style={styles.cardFooter}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Stimmt nicht"
                  onPress={() => handleDismiss(activeCard.fingerprint)}
                  style={styles.dismissButton}
                >
                  <Text style={styles.dismissText}>{tr('eule.dismiss', 'Stimmt nicht')}</Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Mit Eule klären"
                  onPress={() => void handleClarifyCardWithEule(activeCard)}
                  style={styles.clarifyButton}
                  testID="card-clarify-with-eule"
                >
                  <Text style={styles.clarifyButtonText}>Mit Eule klären 💬</Text>
                </Pressable>

                {activeIndex < cards.length - 1 && (
                  <Button
                    variant="ghost"
                    onPress={() => setActiveIndex(activeIndex + 1)}
                    style={styles.nextButton}
                  >
                    {tr('eule.next', 'Nächste Frage →')}
                  </Button>
                )}
              </View>
            </Card>
          </View>
        ) : null}

        <Button onPress={onDone} style={styles.cta}>
          {tr('eule.fertig', 'Zurück zum Cockpit')}
        </Button>
      </>
    )
  }

  const workbench = (
    <>
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle} role="heading" aria-level={2}>
          {tr('eule.workspace.topbar.panelTitle')}
        </Text>
        {wide ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('eule.workspace.topbar.panelClose')}
            onPress={closePanel}
            style={styles.toolbarToggleBtn}
            testID="eule-workbench-close"
          >
            <Text style={styles.toolbarToggleText}>✕</Text>
          </Pressable>
        ) : null}
      </View>
      {renderWorkbenchBody()}
    </>
  )

  /** The project of the tax year: its conversations and its notes. Sidebar on desktop, sheet elsewhere. */
  const projectPanel = (afterSwitch: () => void) => (
    <View style={styles.projectPanel}>
      <ConversationList
        conversations={conversations ?? []}
        activeId={activeConversationId ?? null}
        canSwitch={!effectiveSending}
        onSelect={(id) => {
          onSelectConversation?.(id)
          afterSwitch()
        }}
        onNew={async () => {
          await onNewConversation?.()
          afterSwitch()
        }}
        onRename={async (id, title) => {
          await onRenameConversation?.(id, title)
        }}
        onDelete={async (id) => {
          await onDeleteConversation?.(id)
        }}
        onSearch={onSearchConversations}
      />
      {notes && onAddNote && onEditNote && onDeleteNote ? <ProjectNotes notes={notes} onAdd={onAddNote} onEdit={onEditNote} onDelete={onDeleteNote} /> : null}
    </View>
  )

  // One layout for every width (#476): the chat is the screen. The workbench is a side panel on a
  // wide screen and a sheet over the chat everywhere else, and only there when it is needed.
  return (
    <View style={styles.root} testID="eulen-modus-screen">
      <OwlTopBar
        onBack={onBack}
        hintCount={cards.length}
        draftCount={pendingDrafts.length}
        panelOpen={panelOpen}
        onTogglePanel={() => (panelOpen ? closePanel() : setPanelChoice('open'))}
        onOpenPrivacy={() => setPrivacyOpen(true)}
        onOpenSettings={onToggleOptIn || onChooseProfession || onClearConversation ? () => setSettingsOpen(true) : undefined}
        onOpenConversations={
          conversations && onSelectConversation
            ? () => {
                if (!wide) return setConversationsOpen(true)
                writeOwlSidebarOpen(!sidebarOpen)
                setSidebarOpen(!sidebarOpen)
              }
            : undefined
        }
        conversationsExpanded={wide ? sidebarOpen : conversationsOpen}
        connection={connection && bridge?.reconnecting ? { kind: 'restoring' } : connection}
        onOpenConnection={connection ? () => setConnectionOpen(true) : undefined}
        legalStatusDate={LEGAL_STATUS_DATE}
        compact={bp === 's'}
      />

      <View style={styles.body}>
        {wide && sidebarOpen && conversations && onSelectConversation ? (
          <ScrollView style={styles.projectSidebar} contentContainerStyle={styles.projectSidebarContent} testID="eule-project-sidebar">
            {projectPanel(() => {})}
          </ScrollView>
        ) : null}

        <View style={styles.chatMain} testID="eule-chat-main">
          {renderChatPanel(bp === 's')}
        </View>

        {panelOpen && wide ? (
          <ScrollView style={styles.sidePanel} contentContainerStyle={styles.sidePanelContent} testID="eule-workbench-panel">
            {workbench}
          </ScrollView>
        ) : null}
      </View>

      {panelOpen && !wide ? (
        <Sheet onClose={closePanel} closeLabel={tr('eule.workspace.topbar.panelClose')} testID="eule-workbench-sheet">
          {workbench}
        </Sheet>
      ) : null}

      {connectionOpen && connection ? (
        <Sheet onClose={() => setConnectionOpen(false)} closeLabel={tr('eule.workspace.topbar.privacyClose')} testID="eule-connection-sheet">
          <ConnectionDetails
            view={bridge?.reconnecting ? { kind: 'restoring' } : connection}
            rechecking={rechecking}
            onRecheck={() => {
              setRechecking(true)
              void Promise.resolve(onRecheckConnection?.()).finally(() => setRechecking(false))
            }}
          />
        </Sheet>
      ) : null}

      {privacyOpen ? (
        <Sheet onClose={() => setPrivacyOpen(false)} closeLabel={tr('eule.workspace.topbar.privacyClose')} testID="eule-privacy-sheet">
          <View style={styles.sheetBody}>
            <Text style={styles.sheetTitle} role="heading" aria-level={2}>
              {tr('eule.workspace.topbar.privacyTitle')}
            </Text>
            <Text style={styles.help} testID="eule-privacy-text">
              {tr('eule.workspace.topbar.privacyBody')}
            </Text>
          </View>
        </Sheet>
      ) : null}

      {conversationsOpen && !wide ? (
        <Sheet onClose={() => setConversationsOpen(false)} closeLabel={tr('eule.workspace.topbar.conversationsClose')} testID="eule-conversations-sheet">
          {projectPanel(() => setConversationsOpen(false))}
        </Sheet>
      ) : null}

      {settingsOpen ? (
        <Sheet
          onClose={() => {
            setSettingsOpen(false)
            setClearState('closed')
          }}
          closeLabel={tr('eule.workspace.topbar.settingsClose')}
          testID="eule-settings-sheet"
        >
          {renderSettings()}
        </Sheet>
      ) : null}
    </View>
  )
}
