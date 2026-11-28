import { useState } from 'react'
import { Platform, Pressable, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { LEGAL_STATUS_DATE } from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'
import { ChatDocumentAssignment } from './ChatDocumentAssignment'
import { ChatReceiptResults } from './ChatReceiptResults'
import { AdvisorChatPanel } from './AdvisorChatPanel'
import { SituationChip } from './chat/SituationChip'
import { StoredReceiptPicker } from './chat/StoredReceiptPicker'
import { useOptionalSwitchToTab } from '../../navigation/ShellState'
import type { makeStyles } from './OwlModeScreen.styles'
import type { OwlModeScreenProps } from './OwlModeScreen'
import type { OwlModeScreenState } from './useOwlModeScreen'
import { formatLegalDate, situationWith } from './OwlModeHelpers'
import { ConversationMode } from './conversation/ConversationMode'
import { hearOnServer } from './conversation/useConversation'
import { browserMicrophone, canRecord } from '../../lib/conversation/microphone'
import { useOwlVoice } from '../../lib/readAloud/useOwlVoice'

type OwlModeChatProps = Pick<
  OwlModeScreenProps,
  | 'models'
  | 'chatModel'
  | 'onPickModel'
  | 'partnerName'
  | 'ownName'
  | 'jointReturn'
  | 'opening'
  | 'situation'
  | 'onSaveSituation'
  | 'context'
  | 'onSummarize'
  | 'onUndoNoteChange'
  | 'onRateMessage'
> & {
  readonly owl: OwlModeScreenState
  readonly compact: boolean
  readonly switchToTab: ReturnType<typeof useOptionalSwitchToTab>
  readonly styles: ReturnType<typeof makeStyles>
}

/** The chat of the owl screen, wired to the bridge's answer, receipts and drafts. */
export function OwlModeChat({
  owl,
  compact,
  switchToTab,
  styles,
  models,
  chatModel,
  onPickModel,
  partnerName,
  ownName,
  jointReturn,
  opening,
  situation,
  onSaveSituation,
  context,
  onSummarize,
  onUndoNoteChange,
  onRateMessage,
}: OwlModeChatProps) {
  const { t: tr, i18n } = useTranslation(APP_NS)
  const {
    bridge,
    displayedMessages,
    hasSituationDialog,
    setSituationOpen,
    effectiveSending,
    handleSendChat,
    handleApplyAction,
    handleUndoAction,
    handleDismissAction,
    handleInspectMask,
    handleAttachReceipt,
  } = owl
  // A spoken conversation needs the owl's voice from the server and a browser that can record (ADR-0115).
  const voice = useOwlVoice()
  const [conversationOpen, setConversationOpen] = useState(false)
  const canConverse = voice !== null && Platform.OS === 'web' && canRecord()
  const lastAnswer = displayedMessages.filter((message) => message.role === 'assistant').at(-1)
  return (
    <AdvisorChatPanel
      onOpenConversation={canConverse ? () => setConversationOpen(true) : undefined}
      overlay={
        conversationOpen && voice !== null ? (
          <ConversationMode
            deps={{ microphone: browserMicrophone, hear: hearOnServer, voice, send: (text) => handleSendChat(text, { spoken: true }), stopAnswer: bridge?.stopStreaming, language: i18n.language }}
            answer={{ text: effectiveSending ? (bridge?.streamedText ?? '') : (lastAnswer?.content ?? ''), running: effectiveSending, answerId: lastAnswer?.id ?? null }}
            onClose={() => setConversationOpen(false)}
          />
        ) : undefined
      }
      models={models}
      chatModel={chatModel}
      onPickModel={onPickModel ? (model) => void onPickModel(model) : undefined}
      messages={displayedMessages}
      partnerName={partnerName}
      ownName={ownName}
      jointReturn={jointReturn}
      opening={opening}
      situationChip={hasSituationDialog ? <SituationChip text={situation ?? ''} onPress={() => setSituationOpen(true)} /> : undefined}
      footnote={tr('eule.workspace.topbar.legalStatus', { date: formatLegalDate(LEGAL_STATUS_DATE, i18n.language) })}
      quickChips={[
        // The first four show on an empty chat; the rest wait behind "Mehr …".
        { label: tr('advisor.chat.forgottenChip'), testID: 'advisor-chip-vergessen', quickAction: 'forgotten_check' },
        { label: tr('advisor.chat.assessmentChip'), testID: 'advisor-chip-bescheid', quickAction: 'assessment_check' },
        { label: tr('advisor.chat.homeOfficeChip'), testID: 'advisor-chip-homeoffice' },
        { label: tr('advisor.chat.finalReviewChip'), testID: 'advisor-chip-endpruefung' },
        { label: tr('advisor.chat.savingsPlanChip'), testID: 'advisor-chip-sparplan', quickAction: 'savings_plan' },
        { label: tr('advisor.chat.trainingChip'), testID: 'advisor-chip-fortbildung' },
        { label: tr('advisor.chat.donationsChip'), testID: 'advisor-chip-spenden' },
      ]}
      isSending={effectiveSending}
      context={context}
      onSummarize={onSummarize}
      onUndoNoteChange={onUndoNoteChange}
      onAcceptSituationSuggestion={onSaveSituation ? (text) => onSaveSituation(situationWith(situation, text)) : undefined}
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
      onDismissAction={handleDismissAction}
      onInspectMask={handleInspectMask}
      receiptLinkedActionIds={bridge?.receiptLinkedActionIds}
      onAttachReceipt={handleAttachReceipt}
      // The promise is handed on: the chat reads several files one after another and has to know when one is done.
      onAttachReceiptFile={bridge ? async (file) => void (await bridge.captureReceiptFile(file)) : undefined}
      receiptProgress={bridge?.receiptPhase ? tr(`advisor.chat.receiptProgress.${bridge.receiptPhase}`) : null}
      receiptNotice={bridge?.receiptNotice ?? null}
      receiptQueuePaused={bridge?.documentQuestion != null}
      onReceiptBatchStart={bridge?.startReceiptBatch}
      receiptResults={
        bridge && bridge.receiptResults.length > 0 ? (
          <ChatReceiptResults results={bridge.receiptResults} openYear={bridge.taxYear} onSwitchYear={bridge.switchTaxYear} onClose={bridge.clearReceiptResults} />
        ) : undefined
      }
      receiptAssignment={
        bridge && (bridge.documentQuestion !== null || bridge.documentHolder !== null || bridge.lastParsedReceipt !== null) ? (
          <>
            {bridge.documentQuestion !== null || bridge.documentHolder !== null ? <ChatDocumentAssignment bridge={bridge} /> : null}
            {/* The way back from the chat to the document: its original lies in the Belege tab. */}
            {bridge.lastParsedReceipt !== null && switchToTab ? (
              <Pressable accessibilityRole="button" onPress={() => switchToTab('Receipts')} testID="eule-receipt-result-belege">
                <Text style={styles.help}>{tr('eule.workspace.receiptInInbox')}</Text>
              </Pressable>
            ) : null}
          </>
        ) : undefined
      }
      receiptSources={
        bridge ? (
          <StoredReceiptPicker
            onRead={bridge.readStoredReceipt}
            disabled={bridge.parsingReceipt}
            {...(switchToTab ? { onOpenReceipts: () => switchToTab('Receipts') } : {})}
          />
        ) : undefined
      }
      isParsingReceipt={bridge?.parsingReceipt}
      compact={compact}
    />
  )
}
