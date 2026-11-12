import { useEffect, useState, type ReactNode } from 'react'
import { Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { ChatComposer } from './chat/ChatComposer'
import { ThinkingIndicator } from './chat/ThinkingIndicator'
import { ContextRing, SummaryDivider, type ContextRingState } from './chat/ContextRing'
import { NoteChangeHints } from './chat/ProjectNotes'
import { QuestionRound } from './chat/QuestionRound'
import { SkillsMenu } from './chat/SkillsMenu'
import { TurboSummary, TurboToggle } from './chat/TurboToggle'
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
import { AiChip, Button, Card, useTheme } from '@steuereule/ui'
import { ReceiptPickerButton } from '../shared/ReceiptPickerButton'
import {
  ADVISOR_LEGAL_SOURCES,
  ADVISOR_SKILL_COMMANDS,
  matchingSkillCommands,
  parseSkillCommand,
  type AdvisorChatMessageView,
  type AdvisorFeedbackRating,
  type AdvisorFeedbackReason,
  type AdvisorLegalSource,
  type AdvisorQuickAction,
  type Screen,
  type AdvisorSkillId,
} from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'
import { ModelFailureNotice } from './chat/ModelFailureNotice'
import { ActionProposalCardView, ScannedCertificateCardView, TwoPathsCardView } from './chat/ProposalCards'
import { makeStyles } from './AdvisorChatPanel.styles'
export { makeStyles } from './AdvisorChatPanel.styles'

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
  /** How full the context of this conversation is, and where its summarised part ends (#481). */
  readonly context?: (ContextRingState & { readonly summary?: string | undefined; readonly summarizedUntilMessageId?: string | undefined }) | undefined
  readonly onSummarize?: (() => Promise<void>) | undefined
  /** Takes back one change the owl made to the project notes in an answer (#481). */
  readonly onUndoNoteChange?: ((messageId: string, index: number) => Promise<void>) | undefined
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
  /** The skill that is on for this message (#495). */
  readonly skill?: AdvisorSkillId | undefined
  /** Turbo mode: the owl applies the drafts of this answer itself. */
  readonly turbo?: boolean | undefined
}

/** The options as request fields, without keys that are unset (the DTO forbids explicit undefined). */
export function sendOptionsToDto(options: ChatSendOptions | undefined): { quickAction?: AdvisorQuickAction; replaceFromMessageId?: string; skill?: AdvisorSkillId; turbo?: boolean } {
  return {
    ...(options?.skill ? { skill: options.skill } : {}),
    ...(options?.turbo ? { turbo: true } : {}),
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
  context,
  onSummarize,
  onUndoNoteChange,
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
  // A skill is chosen per session and starts off: the plain chat stays the default.
  const [skill, setSkill] = useState<AdvisorSkillId | null>(null)
  // Off in every new chat: the careful way is the default, Turbo is chosen per session.
  const [turbo, setTurbo] = useState(false)
  /** What is switched on at the input travels with every message; a plain message stays plain. */
  const withSwitches = (options: ChatSendOptions | undefined, activeSkill: AdvisorSkillId | null): ChatSendOptions | undefined =>
    activeSkill || turbo ? { ...options, ...(activeSkill ? { skill: activeSkill } : {}), ...(turbo ? { turbo: true } : {}) } : options
  const send = (text: string, options?: ChatSendOptions) => {
    const merged = withSwitches(options, skill)
    return merged ? onSendMessage(text, merged) : onSendMessage(text)
  }
  const [unknownCommand, setUnknownCommand] = useState<string | null>(null)
  const slashCommands = matchingSkillCommands(inputText)

  /** `/grill-me` switches the skill on and starts it; an unknown command is named, never sent to the owl. */
  function runCommand(text: string): boolean {
    const command = parseSkillCommand(text)
    if (command === null) return false
    setInputText('')
    if (command.kind === 'unknown') {
      setUnknownCommand(command.command)
      return true
    }
    setUnknownCommand(null)
    setSkill(command.skill)
    void onSendMessage(command.rest || tr(`advisor.chat.skills.items.${command.skill}.start`), withSwitches(undefined, command.skill))
    return true
  }

  async function handleSubmit(rawText?: string, quickAction?: AdvisorQuickAction) {
    const text = (rawText ?? inputText).trim()
    if (!text || isSending) return
    if (rawText === undefined) {
      setInputText('')
    }
    await (quickAction ? send(text, { quickAction }) : send(text))
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
    void send(lastUser.content, { replaceFromMessageId: lastUser.id })
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
        {messages.flatMap((msg, index) => [
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
              {msg.meta?.modelFailure ? <ModelFailureNotice failure={msg.meta.modelFailure} answeredByRules={false} /> : null}
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

              {msg.meta?.questionRound ? (
                <QuestionRound round={msg.meta.questionRound} open={index === messages.length - 1 && !isSending} onSubmit={(text) => void send(text)} />
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

              {/* The model did not answer: the rules did, and the reason stays with the answer (#487) */}
              {msg.meta?.modelFailure ? (
                <ModelFailureNotice
                  failure={msg.meta.modelFailure}
                  answeredByRules
                  onRetry={index === messages.length - 1 && canReplace ? regenerate : undefined}
                />
              ) : null}

              {/* What the check of the finished answer found: said by the app, the text stays as written */}
              {msg.meta?.notices && msg.meta.notices.length > 0 ? (
                <View style={styles.notStagedBox} testID="advisor-answer-notices" accessibilityRole="alert">
                  <Text style={styles.notStagedTitle}>{tr('advisor.chat.notices.title', 'Hinweis der App zu dieser Antwort')}</Text>
                  {msg.meta.notices.map((notice) => (
                    <Text key={notice.kind} style={styles.notStagedLine} testID={`advisor-answer-notice-${notice.kind}`}>
                      {notice.text}
                    </Text>
                  ))}
                </View>
              ) : null}

              {msg.meta?.turbo ? <TurboSummary count={[msg.meta.action, ...(msg.meta.actions ?? [])].filter((a) => a?.status === 'applied' || a?.status === 'undone').length} /> : null}

              {/* What the owl noted, replaced or forgot in this answer; each change can be taken back */}
              {msg.meta?.noteChanges && msg.meta.noteChanges.length > 0 ? (
                <NoteChangeHints changes={msg.meta.noteChanges} onUndo={onUndoNoteChange ? (changeIndex) => onUndoNoteChange(msg.id, changeIndex) : undefined} />
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
          // The summarised part ends here; everything above stays readable (#481).
          context?.summarizedUntilMessageId === msg.id ? <SummaryDivider key="summary-divider" summary={context.summary} /> : null,
        ])}

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
              inputTestID="advisor-receipt-file-input"
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
            {slashCommands.length > 0 ? (
              <View style={styles.choicesRow} testID="advisor-slash-menu">
                {slashCommands.map((command) => (
                  <Pressable key={command} accessibilityRole="button" onPress={() => runCommand(`/${command}`)} style={styles.choicePill} testID="advisor-slash-item">
                    <Text style={styles.choicePillText}>{`/${command} · ${tr(`advisor.chat.skills.items.${ADVISOR_SKILL_COMMANDS[command]!}.title`)}`}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {unknownCommand !== null ? (
              <Text style={styles.actionReason} role="alert" testID="advisor-slash-unknown">
                {tr('advisor.chat.skills.unknownCommand', { command: unknownCommand, commands: Object.keys(ADVISOR_SKILL_COMMANDS).map((name) => `/${name}`).join(', ') })}
              </Text>
            ) : null}
            <ChatComposer
              value={inputText}
              onChangeText={setInputText}
              onSend={(text) => {
                if (runCommand(text)) return
                setInputText('')
                const replaceFromMessageId = editingId
                setEditingId(null)
                void (replaceFromMessageId ? send(text, { replaceFromMessageId }) : send(text))
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
              trailing={
                <>
                  <SkillsMenu active={skill} onChange={setSkill} disabled={isSending} />
                  <TurboToggle on={turbo} onChange={setTurbo} disabled={isSending} />
                  {context ? <ContextRing context={context} onSummarize={onSummarize} busy={isSending} /> : null}
                  {microphone}
                </>
              }
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
          inputBar()
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
