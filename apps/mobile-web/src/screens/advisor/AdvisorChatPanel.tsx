import { useEffect, useState, type ReactNode } from 'react'
import { Linking, Pressable, ScrollView, Text, TextInput, View, type TextStyle, type ViewStyle } from 'react-native'
import { ChatComposer } from './chat/ChatComposer'
import { ThinkingIndicator } from './chat/ThinkingIndicator'
import { DictationHint } from './chat/DictationHint'
import { DictationBar } from './chat/DictationBar'
import { browserDictationEngine, type DictationEngine } from '../../lib/dictation/engine'
import { MarkdownMessage } from './chat/MarkdownMessage'
import { OwlMark } from '../../marks/OwlMark'
import { useStickToBottom } from './chat/useStickToBottom'
import { ChatIcon } from '../../icons/ChatIcon'
import { copyToClipboard } from './chat/clipboard'
import { FeedbackButtons } from './chat/FeedbackButtons'
import { ThoughtBlock } from './chat/ThoughtBlock'
import { plainTextForCopy } from './chat/markdownLinks'
import type { AbortedTurn, AdvisorPlanView } from './CopilotBridgeProvider'
import { PlanChecklist } from './chat/PlanChecklist'
import { useTranslation } from 'react-i18next'
import { AiChip, Button, Card, useTheme, type UiTheme } from '@steuereule/ui'
import { ReceiptPickerButton } from '../shared/ReceiptPickerButton'
import {
  ADVISOR_LEGAL_SOURCES,
  formatEuro,
  type AdvisorActionProposal,
  type AdvisorChatMessageView,
  type AdvisorFeedbackRating,
  type AdvisorFeedbackReason,
  type AdvisorLegalSource,
  type AdvisorQuickAction,
  type AdvisorTwoPathsProposal,
  type Screen,
} from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'

export interface AdvisorChatPanelProps {
  readonly greeting?: string | undefined
  readonly messages: readonly AdvisorChatMessageView[]
  readonly quickChips?: readonly (string | AdvisorQuickChip)[] | undefined
  readonly isSending?: boolean | undefined
  readonly streamSteps?: readonly string[] | undefined
  readonly streamedText?: string | undefined
  /** The reasoning summary of the running answer, as far as it has arrived (#476). */
  readonly streamedReasoning?: string | undefined
  /** The question of the running turn; shown until `messages` contains it. */
  readonly pendingUserMessage?: AdvisorChatMessageView | null | undefined
  /** True while the connection to a running answer is being restored. */
  readonly reconnecting?: boolean | undefined
  /** Stores a rating; without it the chat offers none (e.g. the local preview). */
  readonly onRateMessage?:
    | ((messageId: string, rating: AdvisorFeedbackRating | null, reason?: AdvisorFeedbackReason) => Promise<void> | void)
    | undefined
  readonly chatError?: string | null | undefined
  readonly basisMode?: boolean | undefined
  readonly onSendMessage: (text: string, options?: ChatSendOptions) => Promise<void> | void
  /** On-device dictation (#451 slice 5); the browser engine unless a test passes its own. */
  readonly dictationEngine?: DictationEngine | undefined
  /** The plan of the current or last answer (#451 slice 6). */
  readonly plan?: AdvisorPlanView | null | undefined
  /** Stops the running answer; without it the chat offers no Stop (e.g. the non-streaming companion). */
  readonly onStop?: (() => void) | undefined
  /** The last answer the user stopped: partial text, marked as aborted, with „Noch mal fragen“. */
  readonly abortedTurn?: AbortedTurn | null | undefined
  readonly onApplyAction?: ((actionId: string) => Promise<void> | void) | undefined
  readonly onUndoAction?: ((actionId: string) => Promise<void> | void) | undefined
  readonly onInspectMask?: ((screen: Screen, field?: string) => void) | undefined
  readonly receiptLinkedActionIds?: ReadonlySet<string> | undefined
  readonly onAttachReceipt?: ((input: { readonly fileName: string; readonly rawText: string }) => Promise<void> | void) | undefined
  /** Upload a PDF or photo: stored encrypted, read on the device, parsed (#444). */
  readonly onAttachReceiptFile?: ((file: File) => Promise<void> | void) | undefined
  /** Visible progress text of the running receipt capture, if any. */
  readonly receiptProgress?: string | null | undefined
  readonly receiptNotice?: string | null | undefined
  readonly isParsingReceipt?: boolean | undefined
  readonly compact?: boolean | undefined
  /**
   * `panel` (default): a card among other content, scrolled by its surroundings. `page`: the chat
   * is the screen, with its own scrolling conversation in a reading column and a fixed composer.
   */
  readonly variant?: 'panel' | 'page' | undefined
}

/** Width of the reading column in the page variant. */
export const CHAT_COLUMN_MAX_WIDTH = 760

/** How a message is sent: a quick start, or replacing the latest turn (regenerate / edit, #451 1b). */
export interface ChatSendOptions {
  readonly quickAction?: AdvisorQuickAction | undefined
  readonly replaceFromMessageId?: string | undefined
}

/** The options as request fields, without keys that are unset (the DTO forbids explicit undefined). */
export function sendOptionsToDto(options: ChatSendOptions | undefined): { quickAction?: AdvisorQuickAction; replaceFromMessageId?: string } {
  return {
    ...(options?.quickAction ? { quickAction: options.quickAction } : {}),
    ...(options?.replaceFromMessageId ? { replaceFromMessageId: options.replaceFromMessageId } : {}),
  }
}

/** A quick-start chip that also tells the server how to run the turn (e.g. always with a plan). */
export interface AdvisorQuickChip {
  readonly label: string
  readonly testID: string
  readonly quickAction?: AdvisorQuickAction | undefined
}

function ActionProposalCardView({
  action,
  onApply,
  onUndo,
  onInspectMask,
  receiptLinked,
  onSelectSource,
  styles,
  testIDPrefix = 'advisor-action',
}: {
  readonly action: AdvisorActionProposal
  readonly onApply?: ((actionId: string) => Promise<void> | void) | undefined
  readonly onUndo?: ((actionId: string) => Promise<void> | void) | undefined
  readonly onInspectMask?: ((screen: Screen, field?: string) => void) | undefined
  readonly receiptLinked?: boolean | undefined
  readonly onSelectSource: (source: AdvisorLegalSource) => void
  readonly styles: ReturnType<typeof makeStyles>
  readonly testIDPrefix?: string
}) {
  const { t: tr } = useTranslation(APP_NS)
  const [busyStatus, setBusyStatus] = useState<AdvisorActionProposal['status'] | null>(null)
  const isBusy = busyStatus === action.status
  const legalSource = ADVISOR_LEGAL_SOURCES[action.sourceId]
  const showPauschbetrag =
    action.deltaEur === 0 && (action.sourceId.startsWith('estg-9') || action.sourceId === 'estg-4-5-6c')

  async function handleApply() {
    if (!onApply || isBusy) return
    const startingStatus = action.status
    setBusyStatus(startingStatus)
    try {
      await onApply(action.actionId)
    } finally {
      setBusyStatus((current) => (current === startingStatus ? null : current))
    }
  }

  async function handleUndo() {
    if (!onUndo || isBusy) return
    const startingStatus = action.status
    setBusyStatus(startingStatus)
    try {
      await onUndo(action.actionId)
    } finally {
      setBusyStatus((current) => (current === startingStatus ? null : current))
    }
  }

  return (
    <View style={styles.actionCard} testID={`${testIDPrefix}-card`}>
      <View style={styles.actionHeader}>
        <Text style={styles.actionLabel}>{action.label}</Text>
        {action.deltaEur > 0 ? (
          <Text style={styles.actionDeltaBadge} testID={`${testIDPrefix}-delta`}>
            {tr('advisor.chat.taxEffect', {
              amount: formatEuro(action.deltaEur),
              defaultValue: `+${formatEuro(action.deltaEur)} Steuer-Effekt`,
            })}
          </Text>
        ) : showPauschbetrag ? (
          <Text style={styles.pauschbetragBadge} testID={`${testIDPrefix}-pauschbetrag-badge`}>
            {tr('advisor.chat.pauschbetragBadge', 'Im Pauschbetrag (1.230 €)')}
          </Text>
        ) : null}
      </View>

      {receiptLinked ? (
        <Text style={styles.receiptLinkedBadge} testID={`${testIDPrefix}-receipt-badge`}>
          {tr('eule.workspace.provenanceReceiptOwl', '📎 Beleg + Eule')}
        </Text>
      ) : null}

      <View style={styles.diffBox}>
        <View style={styles.diffRow}>
          <Text style={styles.diffCaption}>{tr('advisor.chat.entryLabel', 'Eintrag:')}</Text>
          <Text style={styles.diffValues}>
            {`${action.previousValue ?? tr('advisor.chat.notRecorded', 'Nicht erfasst')} → `}
            <Text style={styles.diffNewValue}>{action.newValue}</Text>
          </Text>
        </View>
        <View style={styles.diffRow}>
          <Text style={styles.diffCaption}>{tr('advisor.chat.refundSimulation', 'Erstattung (Simulation):')}</Text>
          <Text style={styles.diffValues}>
            {`${formatEuro(action.beforeRefundEur)} → `}
            <Text style={styles.diffNewValue}>{formatEuro(action.afterRefundEur)}</Text>
          </Text>
        </View>
      </View>

      <Text style={styles.actionReason}>{action.reason}</Text>

      {legalSource ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onSelectSource(legalSource)}
          style={styles.sourcePill}
        >
          <Text style={styles.sourcePillText}>
            {tr('advisor.chat.legalStatusDate', {
              paragraph: legalSource.paragraph,
              date: legalSource.legalStatusDate,
              defaultValue: `${legalSource.paragraph} · Rechtsstand ${legalSource.legalStatusDate}`,
            })}
          </Text>
        </Pressable>
      ) : null}

      <View style={styles.actionFooter}>
        {action.status === 'superseded' ? (
          <Text style={styles.mutedStatusBadge} testID={`${testIDPrefix}-superseded-badge`}>
            {tr('advisor.chat.supersededBadge', 'Ersetzt durch neueren Entwurf')}
          </Text>
        ) : action.status === 'dismissed' ? (
          <Text style={styles.mutedStatusBadge} testID={`${testIDPrefix}-dismissed-badge`}>
            {tr('advisor.chat.dismissedBadge', 'Verworfen')}
          </Text>
        ) : action.status === 'applied' ? (
          <View style={styles.appliedRow}>
            <Text style={styles.appliedBadge} testID={`${testIDPrefix}-applied-badge`}>
              {tr('advisor.chat.appliedBadge', '✓ Übernommen & bestätigt (SteuerEule)')}
            </Text>
            {onUndo ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={tr('advisor.chat.undoAria', 'Rückgängig machen')}
                disabled={isBusy}
                onPress={() => void handleUndo()}
                style={styles.undoButton}
                testID={`${testIDPrefix}-undo-btn`}
              >
                <Text style={styles.undoButtonText}>{tr('advisor.chat.undoButton', '↩ Rückgängig machen')}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <Button
            onPress={() => void handleApply()}
            disabled={isBusy}
            testID={`${testIDPrefix}-apply-btn`}
          >
            {action.status === 'undone'
              ? tr('advisor.chat.applyAgain', '✓ Erneut übernehmen')
              : tr('advisor.chat.applyNow', '✓ Jetzt übernehmen')}
          </Button>
        )}

        {onInspectMask ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => onInspectMask(action.screen, action.field)}
            style={styles.inspectMaskBtn}
            testID={`${testIDPrefix}-inspect-mask-btn`}
          >
            <Text style={styles.inspectMaskText}>{tr('advisor.chat.inspectMask', 'Maske ansehen →')}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

/**
 * A scanned Lohnsteuerbescheinigung stages several fields at once (meta.actions). The chat
 * shows what was read and how sure it is; taking the values over happens in the LStB mask,
 * where yellow fields need a single confirmation and conflicts are shown (ADR-0008).
 */
function ScannedCertificateCardView({
  actions,
  onInspectMask,
  styles,
}: {
  readonly actions: readonly AdvisorActionProposal[]
  readonly onInspectMask?: ((screen: Screen, field?: string) => void) | undefined
  readonly styles: ReturnType<typeof makeStyles>
}) {
  const { t: tr } = useTranslation(APP_NS)
  const pending = actions.filter((a) => a.status === 'pending')
  const allApplied = pending.length === 0
  return (
    <View style={styles.actionCard} testID="advisor-lstb-scan-card">
      <Text style={styles.actionLabel}>{tr('advisor.chat.lstbScan.title', 'Lohnsteuerbescheinigung erkannt')}</Text>
      {actions.map((a) => (
        <View key={a.actionId} style={styles.actionHeader} testID={`advisor-lstb-scan-row-${a.field}`}>
          <Text style={styles.actionReason}>
            {a.label}: {a.newValue === '' ? tr('advisor.chat.lstbScan.notRead', 'nicht gelesen') : formatEuro(Number(a.newValue))}
          </Text>
          <Text
            style={a.confidenceStatus === 'pruefen' ? styles.pauschbetragBadge : styles.actionDeltaBadge}
            testID={`advisor-lstb-scan-status-${a.field}`}
          >
            {a.confidenceStatus === 'pruefen'
              ? tr('advisor.chat.lstbScan.check', 'bitte prüfen')
              : tr('advisor.chat.lstbScan.ok', 'sicher gelesen')}
          </Text>
        </View>
      ))}
      {allApplied ? (
        <Text style={styles.actionReason} testID="advisor-lstb-scan-applied">
          {tr('advisor.chat.lstbScan.applied', 'Übernommen.')}
        </Text>
      ) : onInspectMask ? (
        <Button onPress={() => onInspectMask('lstb')} testID="advisor-lstb-scan-review">
          {tr('advisor.chat.lstbScan.review', 'Prüfen & übernehmen')}
        </Button>
      ) : null}
    </View>
  )
}

function TwoPathsCardView({
  twoPaths,
  onApply,
  onUndo,
  onInspectMask,
  receiptLinkedActionIds,
  onSelectSource,
  styles,
}: {
  readonly twoPaths: AdvisorTwoPathsProposal
  readonly onApply?: ((actionId: string) => Promise<void> | void) | undefined
  readonly onUndo?: ((actionId: string) => Promise<void> | void) | undefined
  readonly onInspectMask?: ((screen: Screen, field?: string) => void) | undefined
  readonly receiptLinkedActionIds?: ReadonlySet<string> | undefined
  readonly onSelectSource: (source: AdvisorLegalSource) => void
  readonly styles: ReturnType<typeof makeStyles>
}) {
  return (
    <View style={styles.twoPathsContainer} testID="advisor-two-paths-card">
      <Text style={styles.twoPathsTitle}>{twoPaths.title}</Text>
      <ActionProposalCardView
        action={twoPaths.safePath}
        onApply={onApply}
        onUndo={onUndo}
        onInspectMask={onInspectMask}
        receiptLinked={receiptLinkedActionIds?.has(twoPaths.safePath.actionId)}
        onSelectSource={onSelectSource}
        styles={styles}
        testIDPrefix="advisor-path-safe"
      />
      <View style={styles.maxPathWrapper}>
        <Text style={styles.evidenceHintText}>{twoPaths.maxPath.evidenceHint}</Text>
        <ActionProposalCardView
          action={twoPaths.maxPath}
          onApply={onApply}
          onUndo={onUndo}
          onInspectMask={onInspectMask}
          receiptLinked={receiptLinkedActionIds?.has(twoPaths.maxPath.actionId)}
          onSelectSource={onSelectSource}
          styles={styles}
          testIDPrefix="advisor-path-max"
        />
      </View>
    </View>
  )
}

export function AdvisorChatPanel({
  greeting,
  messages: allMessages,
  quickChips = [],
  isSending = false,
  streamSteps = [],
  streamedText = '',
  streamedReasoning = '',
  pendingUserMessage = null,
  reconnecting = false,
  onRateMessage,
  chatError = null,
  basisMode = false,
  onSendMessage,
  onStop,
  abortedTurn = null,
  plan = null,
  dictationEngine = browserDictationEngine,
  onApplyAction,
  onUndoAction,
  onInspectMask,
  receiptLinkedActionIds,
  onAttachReceipt,
  onAttachReceiptFile,
  receiptProgress = null,
  receiptNotice = null,
  isParsingReceipt = false,
  compact = false,
  variant = 'panel',
}: AdvisorChatPanelProps) {
  const pageScroll = useStickToBottom()
  const theme = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(theme)
  const [inputText, setInputText] = useState('')
  const [selectedSource, setSelectedSource] = useState<AdvisorLegalSource | null>(null)
  const [receiptOpen, setReceiptOpen] = useState(false)
  const [receiptTextOpen, setReceiptTextOpen] = useState(false)
  const [receiptFileName, setReceiptFileName] = useState('beleg.pdf')
  const [receiptRawText, setReceiptRawText] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [dictationSupported, setDictationSupported] = useState(false)

  useEffect(() => {
    let alive = true
    void dictationEngine
      .support()
      .then((result) => alive && setDictationSupported(result.supported))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [dictationEngine])
  const [editingId, setEditingId] = useState<string | null>(null)

  async function handleSubmit(rawText?: string, quickAction?: AdvisorQuickAction) {
    const text = (rawText ?? inputText).trim()
    if (!text || isSending) return
    if (rawText === undefined) {
      setInputText('')
    }
    await (quickAction ? onSendMessage(text, { quickAction }) : onSendMessage(text))
  }

  // An answer that is still being written is shown by the live bubble, not from the stored list.
  const messages = allMessages.filter((m) => !(m.role === 'assistant' && m.status === 'streaming'))
  const showPendingUser = isSending && pendingUserMessage !== null && !messages.some((m) => m.id === pendingUserMessage.id)
  const lastMessage = messages.at(-1)
  const lastIsStoredInterrupted = lastMessage?.role === 'assistant' && (lastMessage.status === 'aborted' || lastMessage.status === 'failed')

  // The plan sits above the answer it belongs to: the live one, the stopped one, or the last one.
  const lastAssistantIndex = messages.reduce((last, m, i) => (m.role === 'assistant' ? i : last), -1)
  const lastUserIndex = messages.reduce((last, m, i) => (m.role === 'user' ? i : last), -1)
  const lastUser = lastUserIndex === -1 ? null : messages[lastUserIndex]!
  const canReplace = !isSending && lastUser !== null

  async function copyMessage(id: string, content: string) {
    if (await copyToClipboard(plainTextForCopy(content))) {
      setCopiedId(id)
      setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 2000)
    }
  }

  function regenerate() {
    if (!canReplace || lastUser === null) return
    void onSendMessage(lastUser.content, { replaceFromMessageId: lastUser.id })
  }

  function startEdit() {
    if (!canReplace || lastUser === null) return
    setEditingId(lastUser.id)
    setInputText(lastUser.content)
  }

  function cancelEdit() {
    setEditingId(null)
    setInputText('')
  }
  const planAboveLastAnswer = plan !== null && !isSending && abortedTurn === null

  async function handleReceiptSubmit() {
    if (!onAttachReceipt || isParsingReceipt) return
    const fileName = receiptFileName.trim() || 'beleg.pdf'
    const rawText = receiptRawText.trim()
    if (!rawText) return
    await onAttachReceipt({ fileName, rawText })
    setReceiptRawText('')
    setReceiptOpen(false)
  }

  const isEmpty = messages.length === 0 && !isSending && abortedTurn === null

  const header = (
    <>
      <View style={styles.chatHeader}>
        <AiChip style={styles.sender} testID="eule-sender-chat">
          {tr('advisor.chat.sender', 'Die Eule')}
        </AiChip>
        <Text style={styles.heading}>{tr('advisor.chat.heading', 'Steuer-Assistent')}</Text>
        <Text style={styles.help}>
          {greeting ??
            tr(
              'advisor.chat.help',
              'Stelle Fragen zu deinen Werbungskosten, Freibeträgen oder Belegen. Antworten erfolgen transparent mit Angabe der Rechtsgrundlage.',
            )}
        </Text>
      </View>
    </>
  )

  // The page variant greets an empty chat with the owl; once there is a conversation it needs no header.
  const pageIntro = isEmpty ? (
    <View style={styles.emptyState} testID="advisor-empty-state">
      <OwlMark variant="tinte" size={72} />
      <Text style={styles.emptyTitle} role="heading" aria-level={2}>
        {tr('advisor.chat.emptyTitle')}
      </Text>
      <Text style={styles.emptyHelp}>{greeting ?? tr('advisor.chat.help')}</Text>
    </View>
  ) : null

  const body = (
    <>
      {/* Quick-Starter Chips */}
      {quickChips.length > 0 && messages.length === 0 ? (
        <View style={[styles.quickChipsRow, variant === 'page' && styles.quickChipsRowCentered]} testID="advisor-quick-chips">
          {quickChips.map((entry) => {
            const chip = typeof entry === 'string' ? { label: entry, testID: undefined, quickAction: undefined } : entry
            return (
              <Pressable
                key={chip.label}
                accessibilityRole="button"
                onPress={() => void handleSubmit(chip.label, chip.quickAction)}
                style={styles.quickChipButton}
                testID={chip.testID}
              >
                <Text style={styles.quickChipText}>{chip.label}</Text>
              </Pressable>
            )
          })}
        </View>
      ) : null}

      {/* Conversation History */}
      <View style={styles.messagesList}>
        {messages.map((msg, index) =>
          msg.role === 'user' ? (
            <View key={msg.id} style={styles.userTurn}>
              <View style={styles.userBubble} testID="advisor-user-message">
                <Text style={styles.userBubbleText}>{msg.content}</Text>
              </View>
              {index === lastUserIndex && canReplace && editingId === null ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={tr('advisor.chat.editAria')}
                  onPress={startEdit}
                  style={styles.messageAction}
                  testID="advisor-message-edit"
                >
                  <Text style={styles.messageActionText}>{tr('advisor.chat.edit')}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : msg.status === 'aborted' || msg.status === 'failed' ? (
            <Card key={msg.id} style={styles.assistantBubble} testID={msg.status === 'aborted' ? 'advisor-message-aborted' : 'advisor-message-failed'}>
              <View style={styles.assistantBubbleHeader}>
                <AiChip>{tr('advisor.chat.sender', 'Die Eule')}</AiChip>
                <Text style={styles.abortedBadge}>{tr(msg.status === 'aborted' ? 'advisor.chat.aborted' : 'advisor.chat.failed')}</Text>
              </View>
              <ThoughtBlock reasoning={msg.reasoning} steps={msg.meta?.steps} />
              {msg.content.length > 0 ? <MarkdownMessage content={msg.content} onSelectSource={setSelectedSource} /> : null}
              {index === messages.length - 1 && canReplace ? (
                <Pressable accessibilityRole="button" onPress={regenerate} style={styles.choicePill} testID="advisor-retry">
                  <Text style={styles.choicePillText}>{tr('advisor.chat.retry')}</Text>
                </Pressable>
              ) : null}
            </Card>
          ) : (
            <View key={msg.id}>
            {planAboveLastAnswer && index === lastAssistantIndex ? <PlanChecklist plan={plan} /> : null}
            <Card style={styles.assistantBubble} testID="advisor-assistant-message">
              <View style={styles.assistantBubbleHeader}>
                <AiChip>{tr('advisor.chat.sender', 'Die Eule')}</AiChip>
              </View>
              <ThoughtBlock reasoning={msg.reasoning} steps={msg.meta?.steps} />
              <MarkdownMessage content={msg.content} onSelectSource={setSelectedSource} />

              {/* Source Pills when sources are in meta */}
              {msg.meta?.sources && msg.meta.sources.length > 0 ? (
                <View style={styles.sourcesRow}>
                  {msg.meta.sources.map((srcId) => {
                    const src = ADVISOR_LEGAL_SOURCES[srcId]
                    if (!src) return null
                    return (
                      <Pressable
                        key={srcId}
                        accessibilityRole="button"
                        onPress={() => setSelectedSource(src)}
                        style={styles.sourcePill}
                        testID={`meta-source-chip-${srcId}`}
                      >
                        <Text style={styles.sourcePillText}>{src.paragraph}</Text>
                      </Pressable>
                    )
                  })}
                </View>
              ) : null}

              {/* Mandanten-Anamnese Follow-up Choice Pills */}
              {msg.meta?.choices && msg.meta.choices.length > 0 ? (
                <View style={styles.choicesContainer} testID="advisor-followup-choices">
                  <Text style={styles.choicesCaption}>{tr('advisor.chat.choicesCaption', 'Schnellantwort wählen:')}</Text>
                  <View style={styles.choicesRow}>
                    {msg.meta.choices.map((choice) => (
                      <Pressable
                        key={choice}
                        accessibilityRole="button"
                        onPress={() => void handleSubmit(choice)}
                        style={styles.choicePill}
                        testID="advisor-choice-pill"
                      >
                        <Text style={styles.choicePillText}>{choice}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}

              {/* Single Action Proposal Card */}
              {msg.meta?.action ? (
                <ActionProposalCardView
                  action={msg.meta.action}
                  onApply={onApplyAction}
                  onUndo={onUndoAction}
                  onInspectMask={onInspectMask}
                  receiptLinked={receiptLinkedActionIds?.has(msg.meta.action.actionId)}
                  onSelectSource={setSelectedSource}
                  styles={styles}
                />
              ) : null}

              {/* Several drafts in one answer: one card each, applied one by one or together */}
              {!msg.meta?.lstbScan
                ? (msg.meta?.actions ?? []).map((action) => (
                    <ActionProposalCardView
                      key={action.actionId}
                      action={action}
                      onApply={onApplyAction}
                      onUndo={onUndoAction}
                      onInspectMask={onInspectMask}
                      receiptLinked={receiptLinkedActionIds?.has(action.actionId)}
                      onSelectSource={setSelectedSource}
                      styles={styles}
                    />
                  ))
                : null}

              {/* What the owl tried to prepare and could not: said by the app, not left to the model */}
              {msg.meta?.notStaged && msg.meta.notStaged.length > 0 ? (
                <View style={styles.notStagedBox} testID="advisor-not-staged" accessibilityRole="alert">
                  <Text style={styles.notStagedTitle}>{tr('advisor.chat.notStaged.title', 'Nicht vorbereitet')}</Text>
                  {msg.meta.notStaged.map((item, i) => (
                    <View key={`${item.label}-${i}`} style={styles.notStagedItem}>
                      <Text style={styles.notStagedLine}>
                        {item.label}: {item.reason}
                      </Text>
                      {item.screen && onInspectMask ? (
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => onInspectMask(item.screen!)}
                          style={styles.inspectMaskBtn}
                          testID="advisor-not-staged-open-mask"
                        >
                          <Text style={styles.inspectMaskText}>{tr('advisor.chat.notStaged.openMask', 'Maske öffnen')}</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : null}

              {/* Scanned LStB: several staged fields at once */}
              {msg.meta?.lstbScan && msg.meta.actions && msg.meta.actions.length > 0 ? (
                <ScannedCertificateCardView actions={msg.meta.actions} onInspectMask={onInspectMask} styles={styles} />
              ) : null}

              {/* Two-Paths Comparison Card */}
              {msg.meta?.twoPaths ? (
                <TwoPathsCardView
                  twoPaths={msg.meta.twoPaths}
                  onApply={onApplyAction}
                  onUndo={onUndoAction}
                  onInspectMask={onInspectMask}
                  receiptLinkedActionIds={receiptLinkedActionIds}
                  onSelectSource={setSelectedSource}
                  styles={styles}
                />
              ) : null}

              <View style={styles.messageActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={tr('advisor.chat.copyAria')}
                  onPress={() => void copyMessage(msg.id, msg.content)}
                  style={styles.messageAction}
                  testID="advisor-message-copy"
                >
                  <Text style={styles.messageActionText}>{copiedId === msg.id ? tr('advisor.chat.copied') : tr('advisor.chat.copy')}</Text>
                </Pressable>
                {index === lastAssistantIndex && lastAssistantIndex > lastUserIndex && canReplace ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={tr('advisor.chat.regenerateAria')}
                    onPress={regenerate}
                    style={styles.messageAction}
                    testID="advisor-message-regenerate"
                  >
                    <Text style={styles.messageActionText}>{tr('advisor.chat.regenerate')}</Text>
                  </Pressable>
                ) : null}
              </View>
              {copiedId === msg.id ? (
                <Text style={styles.srOnly} accessibilityLiveRegion="polite" aria-live="polite">
                  {tr('advisor.chat.copied')}
                </Text>
              ) : null}
              {onRateMessage ? (
                <FeedbackButtons feedback={msg.feedback} onRate={(rating, reason) => onRateMessage(msg.id, rating, reason)} />
              ) : null}
            </Card>
            </View>
          ),
        )}

        {showPendingUser ? (
          <View style={styles.userTurn}>
            <View style={styles.userBubble} testID="advisor-user-message">
              <Text style={styles.userBubbleText}>{pendingUserMessage.content}</Text>
            </View>
          </View>
        ) : null}

        {plan !== null && (isSending || abortedTurn !== null) ? <PlanChecklist plan={plan} /> : null}

        {isSending ? <ThoughtBlock reasoning={streamedReasoning} steps={streamedReasoning.length > 0 ? streamSteps : []} live /> : null}

        {isSending && reconnecting ? (
          <Text style={styles.streamStepText} accessibilityLiveRegion="polite" aria-live="polite" testID="advisor-reconnecting">
            {tr('advisor.chat.reconnecting')}
          </Text>
        ) : null}

        {isSending && streamedText.length > 0 ? (
          <Card style={styles.assistantBubble} testID="advisor-streaming-message">
            <View style={styles.assistantBubbleHeader}>
              <AiChip>{tr('advisor.chat.sender', 'Die Eule')}</AiChip>
            </View>
            <View testID="advisor-stream-token-preview" accessibilityLabel={tr('advisor.chat.answering')}>
              <MarkdownMessage content={streamedText} onSelectSource={setSelectedSource} />
            </View>
          </Card>
        ) : isSending ? (
          <ThinkingIndicator steps={streamSteps} />
        ) : null}

        {abortedTurn && !isSending && !lastIsStoredInterrupted ? (
          <Card style={styles.assistantBubble} testID="advisor-message-aborted">
            <View style={styles.assistantBubbleHeader}>
              <AiChip>{tr('advisor.chat.sender', 'Die Eule')}</AiChip>
              <Text style={styles.abortedBadge}>{tr('advisor.chat.aborted')}</Text>
            </View>
            {abortedTurn.partialText.length > 0 ? <MarkdownMessage content={abortedTurn.partialText} onSelectSource={setSelectedSource} /> : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => void handleSubmit(abortedTurn.question)}
              style={styles.choicePill}
              testID="advisor-retry"
            >
              <Text style={styles.choicePillText}>{tr('advisor.chat.retry')}</Text>
            </Pressable>
          </Card>
        ) : null}
      </View>

      {basisMode && !isSending ? (
        <Text style={styles.streamStepText} testID="advisor-basis-mode">
          {tr('advisor.chat.basisMode')}
        </Text>
      ) : null}

      {chatError ? (
        <View style={styles.errorBox} role="alert" testID="advisor-chat-error">
          <Text style={styles.errorText}>{chatError}</Text>
        </View>
      ) : null}

      {/* Receipt attach panel: a PDF or photo first (read on the device, #444), pasted text as fallback */}
      {(onAttachReceipt || onAttachReceiptFile) && receiptOpen ? (
        <Card style={styles.receiptPanel} testID="advisor-receipt-panel">
          {onAttachReceiptFile ? (
            <ReceiptPickerButton
              onFile={(file) => void onAttachReceiptFile(file)}
              disabled={isParsingReceipt}
              testID="advisor-receipt-file"
              unsupportedHint={tr('advisor.chat.receiptNativeHint', 'Kamera-Scan folgt in der App — lade im Web ein PDF oder Foto hoch.')}
            >
              {isParsingReceipt
                ? (receiptProgress ?? tr('advisor.chat.parsingReceipt', 'Beleg wird geprüft …'))
                : tr('advisor.chat.receiptFileCta', 'PDF oder Foto auswählen')}
            </ReceiptPickerButton>
          ) : null}
          <Text style={styles.actionReason}>
            {tr('advisor.chat.receiptPrivacy', 'Der Text wird auf deinem Gerät gelesen. Das Bild geht an keine KI; das Original liegt verschlüsselt in deinen Belegen.')}
          </Text>
          {onAttachReceipt ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setReceiptTextOpen((prev) => !prev)}
              testID="advisor-receipt-text-toggle"
            >
              <Text style={styles.actionReason}>{tr('advisor.chat.receiptPasteText', 'Stattdessen Text einfügen')}</Text>
            </Pressable>
          ) : null}
          {onAttachReceipt && (receiptTextOpen || !onAttachReceiptFile) ? (
            <>
              <TextInput
                accessibilityLabel={tr('advisor.chat.receiptNamePlaceholder', 'Dateiname (z. B. rechnung.pdf)')}
                value={receiptFileName}
                onChangeText={setReceiptFileName}
                placeholder={tr('advisor.chat.receiptNamePlaceholder', 'Dateiname (z. B. rechnung.pdf)')}
                placeholderTextColor={theme.color.tinte2}
                style={styles.textInput}
                testID="advisor-receipt-filename"
              />
              <TextInput
                accessibilityLabel={tr('advisor.chat.receiptTextPlaceholder', 'Belegtext oder Betrag (z. B. Monitor 349 EUR)')}
                value={receiptRawText}
                onChangeText={setReceiptRawText}
                placeholder={tr('advisor.chat.receiptTextPlaceholder', 'Belegtext oder Betrag (z. B. Monitor 349 EUR)')}
                placeholderTextColor={theme.color.tinte2}
                style={styles.textInput}
                multiline
                testID="advisor-receipt-rawtext"
              />
              <View style={styles.receiptActionsRow}>
                <Button
                  onPress={() => void handleReceiptSubmit()}
                  disabled={isParsingReceipt || receiptRawText.trim().length === 0}
                  style={{ flex: 1 }}
                  testID="advisor-receipt-submit-btn"
                >
                  {isParsingReceipt
                    ? tr('advisor.chat.parsingReceipt', 'Beleg wird geprüft …')
                    : tr('advisor.chat.receiptSubmit', 'Beleg prüfen')}
                </Button>
                <Button
                  variant="ghost"
                  onPress={() => setReceiptOpen(false)}
                  style={{ flex: 1 }}
                  testID="advisor-receipt-cancel-btn"
                >
                  {tr('advisor.chat.receiptCancel', 'Abbrechen')}
                </Button>
              </View>
            </>
          ) : null}
          {!onAttachReceipt || !(receiptTextOpen || !onAttachReceiptFile) ? (
            <Button variant="leise" onPress={() => setReceiptOpen(false)} testID="advisor-receipt-close-btn">
              {tr('advisor.chat.receiptCancel', 'Abbrechen')}
            </Button>
          ) : null}
        </Card>
      ) : null}

      {receiptNotice ? (
        <Card style={styles.receiptPanel} testID="advisor-receipt-notice">
          <Text style={styles.actionReason}>{receiptNotice}</Text>
        </Card>
      ) : null}

      {/* Interactive Law Source Popover / Modal */}
      {selectedSource ? (
        <Card style={styles.lawModal} testID="law-source-modal">
          <View style={styles.lawModalHeader}>
            <View>
              <Text style={styles.lawModalParagraph}>{selectedSource.paragraph}</Text>
              <Text style={styles.lawModalTitle}>{selectedSource.title}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tr('advisor.chat.legalSourceCloseAria', 'Rechtsquelle schließen')}
              onPress={() => setSelectedSource(null)}
              style={styles.lawModalCloseBtn}
              testID="law-source-close"
            >
              <Text style={styles.lawModalCloseText}>{tr('advisor.chat.legalSourceClose', '✕ Schließen')}</Text>
            </Pressable>
          </View>
          <Text style={styles.lawModalSummary}>{selectedSource.summary}</Text>
          <View style={styles.lawModalFooter}>
            <Text style={styles.lawModalDate}>
              {tr('advisor.chat.legalStatus', {
                date: selectedSource.legalStatusDate,
                defaultValue: `Rechtsstand: ${selectedSource.legalStatusDate}`,
              })}
            </Text>
            <Pressable
              accessibilityRole="link"
              onPress={() => void Linking.openURL(selectedSource.url)}
            >
              <Text style={styles.lawModalLink}>{tr('advisor.chat.officialLawLink', 'Offizieller Gesetzestext ↗')}</Text>
            </Pressable>
          </View>
        </Card>
      ) : null}
    </>
  )

  const composer = (
    <>
      {(() => {
        const inputBar = (microphone?: ReactNode) => (
          <View style={styles.composer}>
            {editingId !== null ? (
              <View style={styles.editBanner} testID="advisor-edit-banner">
                <Text style={styles.messageActionText}>{tr('advisor.chat.editing')}</Text>
                <Pressable accessibilityRole="button" onPress={cancelEdit} testID="advisor-edit-cancel">
                  <Text style={styles.messageActionText}>{tr('advisor.chat.editCancel')}</Text>
                </Pressable>
              </View>
            ) : null}
            <ChatComposer
              value={inputText}
              onChangeText={setInputText}
              onSend={(text) => {
                setInputText('')
                const replaceFromMessageId = editingId
                setEditingId(null)
                void (replaceFromMessageId ? onSendMessage(text, { replaceFromMessageId }) : onSendMessage(text))
              }}
              onStop={onStop}
              sending={isSending}
              placeholder={
                compact
                  ? tr('advisor.chat.inputPlaceholderShort')
                  : tr('advisor.chat.inputPlaceholder', 'Frag deine Eule (z. B. Fortbildung, Laptop, Spenden, Endprüfung) …')
              }
              inputTestID="advisor-chat-input"
              sendTestID="advisor-chat-send"
              leading={
                onAttachReceipt || onAttachReceiptFile ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={tr('advisor.chat.attachReceiptAria', 'Beleg anhängen')}
                    onPress={() => setReceiptOpen((prev) => !prev)}
                    style={styles.attachButton}
                    testID="advisor-receipt-attach-btn"
                  >
                    <ChatIcon name="attach" color={theme.color.tinte} />
                  </Pressable>
                ) : undefined
              }
              trailing={microphone}
            />
          </View>
        )
        // With dictation the microphone sits inside the input; its consent and status show above it.
        return dictationSupported ? (
          <DictationBar
            engine={dictationEngine}
            disabled={isSending}
            onTranscript={(text) => setInputText((prev) => (prev.trim() ? `${prev.trimEnd()} ${text}` : text))}
          >
            {inputBar}
          </DictationBar>
        ) : (
          <>
            <DictationHint />
            {inputBar()}
          </>
        )
      })()}
    </>
  )

  if (variant === 'page') {
    // The conversation scrolls, the composer stays put: the chat owns the window (#476 decision 1).
    return (
      <View style={styles.pageRoot} testID="advisor-chat-panel">
        <ScrollView {...pageScroll} style={styles.pageScroll} contentContainerStyle={styles.pageScrollContent} testID="advisor-chat-scroll">
          <View style={styles.pageColumn}>
            {pageIntro}
            {body}
          </View>
        </ScrollView>
        <View style={styles.pageComposerDock} testID="advisor-chat-composer-dock">
          <View style={styles.pageColumn}>{composer}</View>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container} testID="advisor-chat-panel">
      {header}
      {body}
      {composer}
    </View>
  )
}

function makeStyles(t: UiTheme) {
  return {
    container: {
      marginTop: t.space.s2,
      marginBottom: t.space.s4,
    } as ViewStyle,
    chatHeader: {
      marginBottom: t.space.s3,
    } as ViewStyle,
    sender: {
      marginBottom: t.space.s2,
    } as ViewStyle,
    heading: {
      fontFamily: t.font.display,
      fontWeight: t.weight.schwer,
      fontSize: t.size.xl,
      color: t.color.tinte,
      marginBottom: t.space.s1,
    } as TextStyle,
    help: {
      fontFamily: t.font.text,
      fontSize: t.size.m,
      color: t.color.tinte2,
      lineHeight: 21,
    } as TextStyle,
    quickChipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: t.space.s2,
      marginBottom: t.space.s4,
    } as ViewStyle,
    quickChipButton: {
      paddingVertical: t.space.s2,
      paddingHorizontal: t.space.s3,
      borderRadius: t.radius.pille,
      backgroundColor: t.color.kiWeich,
      borderWidth: 1,
      borderColor: t.color.ki,
    } as ViewStyle,
    quickChipText: {
      fontFamily: t.font.text,
      fontWeight: t.weight.fett,
      fontSize: t.size.s,
      color: t.color.kiTinte,
    } as TextStyle,
    messagesList: {
      gap: t.space.s3,
      marginBottom: t.space.s4,
    } as ViewStyle,
    userBubble: {
      alignSelf: 'flex-end',
      maxWidth: '85%',
      backgroundColor: t.color.tinte,
      paddingVertical: t.space.s3,
      paddingHorizontal: t.space.s4,
      borderRadius: t.radius.m,
    } as ViewStyle,
    userBubbleText: {
      fontFamily: t.font.text,
      fontSize: t.size.m,
      color: t.color.grund,
    } as TextStyle,
    assistantBubble: {
      padding: t.space.s4,
      borderRadius: t.radius.m,
      backgroundColor: t.color.karte,
      borderWidth: 1,
      borderColor: t.color.kiLinie,
    } as ViewStyle,
    assistantBubbleHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: t.space.s2,
    } as ViewStyle,
    assistantText: {
      fontFamily: t.font.text,
      fontSize: t.size.m,
      color: t.color.tinte,
      lineHeight: 22,
    } as TextStyle,
    inlineLawChip: {
      backgroundColor: t.color.kiWeich,
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: t.radius.s,
      marginHorizontal: 2,
    } as ViewStyle,
    inlineLawChipText: {
      fontFamily: t.font.text,
      fontWeight: t.weight.fett,
      fontSize: t.size.s,
      color: t.color.kiTinte,
    } as TextStyle,
    sourcesRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: t.space.s2,
      marginTop: t.space.s3,
    } as ViewStyle,
    sourcePill: {
      alignSelf: 'flex-start',
      backgroundColor: t.color.kiWeich,
      paddingHorizontal: t.space.s2,
      paddingVertical: 4,
      borderRadius: t.radius.s,
      marginTop: t.space.s2,
    } as ViewStyle,
    sourcePillText: {
      fontFamily: t.font.text,
      fontWeight: t.weight.fett,
      fontSize: t.size.xs,
      color: t.color.kiTinte,
    } as TextStyle,
    choicesContainer: {
      marginTop: t.space.s3,
      paddingTop: t.space.s3,
      borderTopWidth: 1,
      borderTopColor: t.color.linie,
    } as ViewStyle,
    choicesCaption: {
      fontFamily: t.font.text,
      fontWeight: t.weight.fett,
      fontSize: t.size.xs,
      color: t.color.tinte2,
      marginBottom: t.space.s2,
    } as TextStyle,
    choicesRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: t.space.s2,
    } as ViewStyle,
    choicePill: {
      paddingVertical: t.space.s2,
      paddingHorizontal: t.space.s3,
      borderRadius: t.radius.pille,
      backgroundColor: t.color.grund,
      borderWidth: 1,
      borderColor: t.color.ki,
    } as ViewStyle,
    choicePillText: {
      fontFamily: t.font.text,
      fontWeight: t.weight.fett,
      fontSize: t.size.s,
      color: t.color.tinte,
    } as TextStyle,
    notStagedBox: {
      marginTop: t.space.s3,
      padding: t.space.s3,
      borderRadius: t.radius.m,
      backgroundColor: t.color.fehlerWeich,
      borderLeftWidth: 3,
      borderLeftColor: t.color.warn,
      gap: t.space.s1,
    } as ViewStyle,
    notStagedItem: {
      gap: t.space.s2,
      alignItems: 'flex-start',
    } as ViewStyle,
    notStagedTitle: {
      fontFamily: t.font.text,
      fontWeight: t.weight.fett,
      fontSize: t.size.s,
      color: t.color.tinte,
    } as TextStyle,
    notStagedLine: {
      fontFamily: t.font.text,
      fontSize: t.size.s,
      color: t.color.tinte,
    } as TextStyle,
    actionCard: {
      marginTop: t.space.s3,
      padding: t.space.s4,
      borderRadius: t.radius.m,
      backgroundColor: t.color.kiWeich,
      borderWidth: 1.5,
      borderColor: t.color.ki,
    } as ViewStyle,
    actionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: t.space.s2,
      marginBottom: t.space.s2,
    } as ViewStyle,
    actionLabel: {
      fontFamily: t.font.display,
      fontWeight: t.weight.fett,
      fontSize: t.size.m,
      color: t.color.tinte,
    } as TextStyle,
    actionDeltaBadge: {
      fontFamily: t.font.display,
      fontWeight: t.weight.schwer,
      fontSize: t.size.m,
      color: t.color.ok,
    } as TextStyle,
    pauschbetragBadge: {
      fontFamily: t.font.text,
      fontWeight: t.weight.fett,
      fontSize: t.size.xs,
      color: t.color.tinte2,
      backgroundColor: t.color.grund,
      paddingHorizontal: t.space.s2,
      paddingVertical: 2,
      borderRadius: t.radius.s,
    } as TextStyle,
    receiptLinkedBadge: {
      fontFamily: t.font.text,
      fontWeight: t.weight.fett,
      fontSize: t.size.xs,
      color: t.color.kiTinte,
      marginBottom: t.space.s2,
    } as TextStyle,
    diffBox: {
      backgroundColor: t.color.karte,
      borderRadius: t.radius.s,
      padding: t.space.s3,
      marginBottom: t.space.s2,
      gap: 4,
    } as ViewStyle,
    diffRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
    } as ViewStyle,
    diffCaption: {
      fontFamily: t.font.text,
      fontSize: t.size.s,
      color: t.color.tinte2,
    } as TextStyle,
    diffValues: {
      fontFamily: t.font.text,
      fontSize: t.size.s,
      color: t.color.tinte,
    } as TextStyle,
    diffNewValue: {
      fontFamily: t.font.display,
      fontWeight: t.weight.fett,
      color: t.color.kiTinte,
    } as TextStyle,
    actionReason: {
      fontFamily: t.font.text,
      fontSize: t.size.s,
      color: t.color.tinte2,
      marginTop: t.space.s1,
    } as TextStyle,
    actionFooter: {
      marginTop: t.space.s3,
    } as ViewStyle,
    appliedRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: t.space.s2,
    } as ViewStyle,
    appliedBadge: {
      fontFamily: t.font.display,
      fontWeight: t.weight.fett,
      fontSize: t.size.s,
      color: t.color.ok,
    } as TextStyle,
    undoButton: {
      paddingVertical: t.space.s1,
      paddingHorizontal: t.space.s2,
      borderRadius: t.radius.s,
      borderWidth: 1,
      borderColor: t.color.linie,
      backgroundColor: t.color.karte,
    } as ViewStyle,
    undoButtonText: {
      fontFamily: t.font.text,
      fontWeight: t.weight.fett,
      fontSize: t.size.s,
      color: t.color.tinte,
    } as TextStyle,
    mutedStatusBadge: {
      fontFamily: t.font.text,
      fontWeight: t.weight.fett,
      fontSize: t.size.s,
      color: t.color.tinte2,
    } as TextStyle,
    inspectMaskBtn: {
      marginTop: t.space.s2,
      alignSelf: 'flex-start',
      paddingVertical: t.space.s1,
      paddingHorizontal: t.space.s2,
      borderRadius: t.radius.s,
      borderWidth: 1,
      borderColor: t.color.ki,
      backgroundColor: t.color.karte,
    } as ViewStyle,
    inspectMaskText: {
      fontFamily: t.font.text,
      fontWeight: t.weight.fett,
      fontSize: t.size.xs,
      color: t.color.kiTinte,
    } as TextStyle,
    twoPathsContainer: {
      marginTop: t.space.s3,
      gap: t.space.s2,
    } as ViewStyle,
    twoPathsTitle: {
      fontFamily: t.font.display,
      fontWeight: t.weight.fett,
      fontSize: t.size.m,
      color: t.color.tinte,
    } as TextStyle,
    maxPathWrapper: {
      marginTop: t.space.s2,
    } as ViewStyle,
    evidenceHintText: {
      fontFamily: t.font.text,
      fontWeight: t.weight.fett,
      fontSize: t.size.xs,
      color: t.color.warn,
      marginBottom: 4,
    } as TextStyle,
    streamStepText: {
      fontFamily: t.font.text,
      fontSize: t.size.xs,
      color: t.color.tinte2,
      marginTop: 4,
    } as TextStyle,
    errorBox: {
      padding: t.space.s3,
      borderRadius: t.radius.m,
      backgroundColor: t.color.fehlerWeich,
      borderWidth: 1,
      borderColor: t.color.fehler,
      marginBottom: t.space.s3,
    } as ViewStyle,
    errorText: {
      fontFamily: t.font.text,
      fontWeight: t.weight.fett,
      fontSize: t.size.s,
      color: t.color.fehler,
    } as TextStyle,
    receiptPanel: {
      padding: t.space.s3,
      gap: t.space.s2,
      borderColor: t.color.kiLinie,
      marginBottom: t.space.s3,
    } as ViewStyle,
    receiptActionsRow: {
      flexDirection: 'row',
      gap: t.space.s2,
    } as ViewStyle,
    lawModal: {
      padding: t.space.s4,
      borderRadius: t.radius.m,
      backgroundColor: t.color.karte,
      borderWidth: 2,
      borderColor: t.color.ki,
      marginBottom: t.space.s4,
    } as ViewStyle,
    lawModalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: t.space.s2,
    } as ViewStyle,
    lawModalParagraph: {
      fontFamily: t.font.display,
      fontWeight: t.weight.schwer,
      fontSize: t.size.l,
      color: t.color.kiTinte,
    } as TextStyle,
    lawModalTitle: {
      fontFamily: t.font.display,
      fontWeight: t.weight.fett,
      fontSize: t.size.m,
      color: t.color.tinte,
    } as TextStyle,
    lawModalCloseBtn: {
      padding: t.space.s1,
    } as ViewStyle,
    lawModalCloseText: {
      fontFamily: t.font.text,
      fontWeight: t.weight.fett,
      fontSize: t.size.s,
      color: t.color.tinte2,
    } as TextStyle,
    lawModalSummary: {
      fontFamily: t.font.text,
      fontSize: t.size.m,
      color: t.color.tinte,
      lineHeight: 21,
      marginBottom: t.space.s3,
    } as TextStyle,
    lawModalFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderTopWidth: 1,
      borderTopColor: t.color.linie,
      paddingTop: t.space.s2,
    } as ViewStyle,
    lawModalDate: {
      fontFamily: t.font.text,
      fontSize: t.size.xs,
      color: t.color.tinte2,
    } as TextStyle,
    lawModalLink: {
      fontFamily: t.font.text,
      fontWeight: t.weight.fett,
      fontSize: t.size.xs,
      color: t.color.kiTinte,
    } as TextStyle,
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.s2,
    } as ViewStyle,
    inputRowCompact: {
      gap: t.space.s1,
    } as ViewStyle,
    composer: { flex: 1 } as ViewStyle,
    quickChipsRowCentered: { justifyContent: 'center' } as ViewStyle,
    pageRoot: { flex: 1, minHeight: 0 } as ViewStyle,
    pageScroll: { flex: 1 } as ViewStyle,
    pageScrollContent: { paddingHorizontal: t.space.s4, paddingTop: t.space.s4, paddingBottom: t.space.s3, flexGrow: 1 } as ViewStyle,
    pageColumn: { width: '100%', maxWidth: CHAT_COLUMN_MAX_WIDTH, alignSelf: 'center' } as ViewStyle,
    pageComposerDock: {
      paddingHorizontal: t.space.s4,
      paddingTop: t.space.s2,
      paddingBottom: t.space.s3,
      backgroundColor: t.color.grund,
      borderTopWidth: 1,
      borderTopColor: t.color.linieWeich,
    } as ViewStyle,
    emptyState: { alignItems: 'center', gap: t.space.s3, paddingVertical: t.space.s6, marginBottom: t.space.s3 } as ViewStyle,
    emptyTitle: { fontFamily: t.font.display, fontWeight: t.weight.fett, fontSize: t.size.l, color: t.color.tinte, textAlign: 'center' } as TextStyle,
    emptyHelp: { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte2, textAlign: 'center', maxWidth: 520 } as TextStyle,
    userTurn: { alignItems: 'flex-end' } as ViewStyle,
    messageActions: { flexDirection: 'row', gap: t.space.s3, marginTop: t.space.s2 } as ViewStyle,
    messageAction: { paddingVertical: 2 } as ViewStyle,
    messageActionText: { fontFamily: t.font.text, fontSize: t.size.xs, color: t.color.tinte2, fontWeight: t.weight.fett } as TextStyle,
    editBanner: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: t.space.s1 } as ViewStyle,
    srOnly: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 } as TextStyle,
    abortedBadge: {
      fontFamily: t.font.text,
      fontSize: t.size.xs,
      color: t.color.tinte2,
      marginLeft: t.space.s2,
    } as TextStyle,
    attachButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' } as ViewStyle,
    attachButtonText: {
      fontSize: t.size.m,
      color: t.color.tinte,
    } as TextStyle,
    textInput: {
      flex: 1,
      backgroundColor: t.color.karte,
      borderWidth: 1,
      borderColor: t.color.linie,
      borderRadius: t.radius.m,
      paddingHorizontal: t.space.s3,
      paddingVertical: t.space.s3,
      fontFamily: t.font.text,
      fontSize: t.size.m,
      color: t.color.tinte,
    } as TextStyle,
  }
}
