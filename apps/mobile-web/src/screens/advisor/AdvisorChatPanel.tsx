import { ScrollView, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { AiChip, useTheme } from '@steuereule/ui'
import { modelCompanyList } from '@steuereule/core'
import { browserDictationEngine } from '../../lib/dictation/engine'
import { SummaryDivider } from './chat/ContextRing'
import { OwlMark } from '../../marks/OwlMark'
import { useStickToBottom } from './chat/useStickToBottom'
import { APP_NS } from '../../i18n/resources'
import { makeStyles } from './AdvisorChatPanel.styles'
import type { AdvisorChatPanelProps } from './AdvisorChat.types'
import { useAdvisorChat } from './useAdvisorChat'
import { AdvisorChatMessage } from './AdvisorChatMessage'
import { AdvisorChatLiveTurn } from './AdvisorChatLiveTurn'
import { AdvisorChatQuickChips } from './AdvisorChatQuickChips'
import { AdvisorChatReceiptNotice, AdvisorChatReceiptPanel } from './AdvisorChatReceiptPanel'
import { AdvisorChatLawSource } from './AdvisorChatLawSource'
import { AdvisorChatComposer } from './AdvisorChatComposer'
export { makeStyles } from './AdvisorChatPanel.styles'
export type { AdvisorChatOpening, AdvisorChatPanelProps, AdvisorQuickChip, ChatSendOptions } from './AdvisorChat.types'
export { CHAT_COLUMN_MAX_WIDTH, PAGE_QUICK_CHIPS, isOpeningPlaceholder, sendOptionsToDto } from './AdvisorChatHelpers'

export function AdvisorChatPanel({
  models,
  chatModel,
  onPickModel,
  greeting,
  messages: allMessages,
  quickChips = [],
  situationChip,
  footnote,
  isSending = false,
  streamSteps = [],
  streamedText = '',
  streamedReasoning = '',
  pendingUserMessage = null,
  reconnecting = false,
  opening,
  context,
  onSummarize,
  onUndoNoteChange,
  onAcceptSituationSuggestion,
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
  onDismissAction,
  onInspectMask,
  receiptLinkedActionIds,
  partnerName,
  ownName,
  jointReturn,
  onAttachReceipt,
  onAttachReceiptFile,
  receiptProgress = null,
  receiptNotice = null,
  receiptAssignment,
  receiptResults,
  onReceiptBatchStart,
  receiptQueuePaused = false,
  receiptSources,
  isParsingReceipt = false,
  compact = false,
  variant = 'panel',
}: AdvisorChatPanelProps) {
  const pageScroll = useStickToBottom()
  const theme = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(theme)
  const chat = useAdvisorChat({
    models,
    chatModel,
    allMessages,
    isSending,
    pendingUserMessage,
    abortedTurn,
    plan,
    dictationEngine,
    onSendMessage,
    onAttachReceipt,
    onAttachReceiptFile,
    onReceiptBatchStart,
    receiptQueuePaused,
    isParsingReceipt,
  })
  const { messages, isEmpty, receiptOpen, selectedSource, setSelectedSource } = chat
  const answerContext = {
    models,
    chatModel,
    onApplyAction,
    onUndoAction,
    onDismissAction,
    onInspectMask,
    receiptLinkedActionIds,
    partnerName,
    ownName,
    jointReturn,
    onUndoNoteChange,
    onAcceptSituationSuggestion,
    onRateMessage,
    isSending,
  }

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
  // The chat itself is the explanation: no help text, just the question and the input under it.
  const pageIntro = isEmpty ? (
    <View style={styles.emptyState} testID="advisor-empty-state">
      <OwlMark variant="tinte" size={56} />
      <Text style={styles.emptyTitle} role="heading" aria-level={2}>
        {tr('advisor.chat.emptyTitle')}
      </Text>
    </View>
  ) : null
  const quickChipRow = <AdvisorChatQuickChips chat={chat} quickChips={quickChips} opening={opening} variant={variant} styles={styles} />

  // Said before the first message leaves (WEB-25): who receives it and what is removed first.
  const privacyNotice = isEmpty ? (
    <Text style={styles.streamStepText} testID="advisor-privacy-notice">
      {tr('advisor.chat.privacyNotice', { providers: modelCompanyList() })}
    </Text>
  ) : null

  const body = (
    <>
      {privacyNotice}
      {/* On the page the quick starts sit under the centred input of an empty chat. */}
      {variant === 'page' ? null : quickChipRow}

      {/* Conversation History */}
      <View style={styles.messagesList}>
        {messages.flatMap((msg, index) => [
          <AdvisorChatMessage key={msg.id} msg={msg} index={index} chat={chat} panel={answerContext} plan={plan} styles={styles} />,
          // The summarised part ends here; everything above stays readable (#481).
          context?.summarizedUntilMessageId === msg.id ? <SummaryDivider key="summary-divider" summary={context.summary} /> : null,
        ])}

        <AdvisorChatLiveTurn
          chat={chat}
          isSending={isSending}
          pendingUserMessage={pendingUserMessage}
          plan={plan}
          abortedTurn={abortedTurn}
          streamSteps={streamSteps}
          streamedText={streamedText}
          streamedReasoning={streamedReasoning}
          reconnecting={reconnecting}
          styles={styles}
        />
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
      {(onAttachReceipt || onAttachReceiptFile) && receiptOpen ? (
        <AdvisorChatReceiptPanel
          chat={chat}
          onAttachReceipt={onAttachReceipt}
          onAttachReceiptFile={onAttachReceiptFile}
          receiptProgress={receiptProgress}
          receiptSources={receiptSources}
          isParsingReceipt={isParsingReceipt}
          styles={styles}
        />
      ) : null}

      <AdvisorChatReceiptNotice receiptNotice={receiptNotice} receiptAssignment={receiptAssignment} receiptResults={receiptResults} styles={styles} />

      {/* Interactive Law Source Popover / Modal */}
      {selectedSource ? <AdvisorChatLawSource source={selectedSource} onClose={() => setSelectedSource(null)} styles={styles} /> : null}
    </>
  )

  const composer = (
    <AdvisorChatComposer
      chat={chat}
      models={models}
      chatModel={chatModel}
      onPickModel={onPickModel}
      situationChip={situationChip}
      context={context}
      onSummarize={onSummarize}
      onStop={onStop}
      onAttachReceipt={onAttachReceipt}
      onAttachReceiptFile={onAttachReceiptFile}
      isSending={isSending}
      compact={compact}
      dictationEngine={dictationEngine}
      styles={styles}
    />
  )

  if (variant === 'page') {
    // The conversation scrolls, the composer stays put: the chat owns the window (#476 decision 1).
    return (
      <View style={styles.pageRoot} testID="advisor-chat-panel">
        <ScrollView {...pageScroll} style={styles.pageScroll} contentContainerStyle={[styles.pageScrollContent, isEmpty && styles.pageScrollEmpty]} testID="advisor-chat-scroll">
          {isEmpty ? (
            // An empty chat is one centred column: the question, the input, the quick starts (like Claude).
            <View style={[styles.pageColumn, styles.emptyColumn]}>
              {pageIntro}
              <View style={styles.emptyComposer} testID="advisor-chat-composer-dock">
                {composer}
              </View>
              {quickChipRow}
              {body}
            </View>
          ) : (
            <View style={styles.pageColumn}>{body}</View>
          )}
        </ScrollView>
        {isEmpty ? null : (
          <View style={styles.pageComposerDock} testID="advisor-chat-composer-dock">
            <View style={styles.pageColumn}>{composer}</View>
          </View>
        )}
        {footnote ? (
          <Text style={styles.footnote} testID="eule-legal-status">
            {footnote}
          </Text>
        ) : null}
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
