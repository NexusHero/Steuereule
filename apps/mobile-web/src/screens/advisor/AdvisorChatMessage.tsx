import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { AiChip, Card } from '@steuereule/ui'
import { thoughtStepsOf, type AdvisorChatMessageView } from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'
import { MarkdownMessage } from './chat/MarkdownMessage'
import { MaskedNote, MaskedText } from './chat/MaskedText'
import { FeedbackButtons } from './chat/FeedbackButtons'
import { ReadAloudButton } from './chat/ReadAloudButton'
import { ThoughtBlock } from './chat/ThoughtBlock'
import { ModelFailureNotice } from './chat/ModelFailureNotice'
import { PlanChecklist } from './chat/PlanChecklist'
import type { AdvisorPlanView } from './CopilotBridgeProvider'
import type { makeStyles } from './AdvisorChatPanel.styles'
import type { AdvisorChatState } from './useAdvisorChat'
import { AdvisorChatAnswerExtras, type AdvisorChatAnswerContext } from './AdvisorChatAnswerExtras'

interface AdvisorChatMessageProps {
  readonly msg: AdvisorChatMessageView
  readonly index: number
  readonly chat: AdvisorChatState
  readonly panel: AdvisorChatAnswerContext
  readonly plan: AdvisorPlanView | null
  readonly styles: ReturnType<typeof makeStyles>
}

/** One stored message: the user's turn, a stopped or failed answer, or a finished answer. */
export function AdvisorChatMessage({ msg, index, chat, panel, plan, styles }: AdvisorChatMessageProps) {
  const { t: tr } = useTranslation(APP_NS)
  const { messages, lastUserIndex, lastAssistantIndex, canReplace, editingId, startEdit, regenerate, setSelectedSource, copiedId, copyMessage, planAboveLastAnswer } = chat
  const isLast = index === messages.length - 1
  const { onRateMessage } = panel

  if (msg.role === 'user') {
    return (
      <View style={styles.userTurn}>
        <View style={styles.userBubble} testID="advisor-user-message">
          <MaskedText text={msg.content} spans={msg.meta?.masked} style={styles.userBubbleText} />
        </View>
        <MaskedNote spans={msg.meta?.masked} style={styles.maskedNote} />
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
    )
  }

  if (msg.status === 'aborted' || msg.status === 'failed') {
    return (
      <Card style={styles.assistantBubble} testID={msg.status === 'aborted' ? 'advisor-message-aborted' : 'advisor-message-failed'}>
        <View style={styles.assistantBubbleHeader}>
          <AiChip>{tr('advisor.chat.sender', 'Die Eule')}</AiChip>
          <Text style={styles.abortedBadge}>{tr(msg.status === 'aborted' ? 'advisor.chat.aborted' : 'advisor.chat.failed')}</Text>
        </View>
        <ThoughtBlock reasoning={msg.reasoning} steps={thoughtStepsOf(msg.meta)} durationMs={msg.durationMs} />
        {msg.content.length > 0 ? <MarkdownMessage content={msg.content} onSelectSource={setSelectedSource} /> : null}
        {msg.meta?.modelFailure ? <ModelFailureNotice failure={msg.meta.modelFailure} answeredByRules={false} /> : null}
        {isLast && canReplace ? (
          <Pressable accessibilityRole="button" onPress={regenerate} style={styles.choicePill} testID="advisor-retry">
            <Text style={styles.choicePillText}>{tr('advisor.chat.retry')}</Text>
          </Pressable>
        ) : null}
      </Card>
    )
  }

  return (
    <View>
      {planAboveLastAnswer && index === lastAssistantIndex ? <PlanChecklist plan={plan!} /> : null}
      <Card style={styles.assistantBubble} testID="advisor-assistant-message">
        <View style={styles.assistantBubbleHeader}>
          <AiChip>{tr('advisor.chat.sender', 'Die Eule')}</AiChip>
        </View>
        <ThoughtBlock reasoning={msg.reasoning} steps={thoughtStepsOf(msg.meta)} durationMs={msg.durationMs} />
        <MarkdownMessage content={msg.content} onSelectSource={setSelectedSource} />

        <AdvisorChatAnswerExtras msg={msg} isLast={isLast} chat={chat} panel={panel} styles={styles} />

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
          <ReadAloudButton id={msg.id} content={msg.content} style={styles.messageAction} textStyle={styles.messageActionText} />
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
  )
}
