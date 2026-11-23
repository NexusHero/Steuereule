import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { AiChip, Card } from '@steuereule/ui'
import type { AdvisorChatMessageView, AdvisorThoughtStep } from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'
import { MarkdownMessage } from './chat/MarkdownMessage'
import { ThoughtBlock } from './chat/ThoughtBlock'
import { PlanChecklist } from './chat/PlanChecklist'
import type { AbortedTurn, AdvisorPlanView } from './CopilotBridgeProvider'
import type { makeStyles } from './AdvisorChatPanel.styles'
import type { AdvisorChatState } from './useAdvisorChat'

interface AdvisorChatLiveTurnProps {
  readonly chat: AdvisorChatState
  readonly isSending: boolean
  readonly pendingUserMessage: AdvisorChatMessageView | null
  readonly plan: AdvisorPlanView | null
  readonly abortedTurn: AbortedTurn | null
  readonly streamSteps: readonly AdvisorThoughtStep[]
  readonly streamedText: string
  readonly streamedReasoning: string
  readonly reconnecting: boolean
  readonly styles: ReturnType<typeof makeStyles>
}

/** The running turn under the stored list: its question, plan, thoughts and text, or what is left after Stop. */
export function AdvisorChatLiveTurn({ chat, isSending, pendingUserMessage, plan, abortedTurn, streamSteps, streamedText, streamedReasoning, reconnecting, styles }: AdvisorChatLiveTurnProps) {
  const { t: tr } = useTranslation(APP_NS)
  const { showPendingUser, lastIsStoredInterrupted, setSelectedSource, handleSubmit } = chat
  return (
    <>
      {showPendingUser && pendingUserMessage !== null ? (
        <View style={styles.userTurn}>
          <View style={styles.userBubble} testID="advisor-user-message">
            <Text style={styles.userBubbleText}>{pendingUserMessage.content}</Text>
          </View>
        </View>
      ) : null}

      {plan !== null && (isSending || abortedTurn !== null) ? <PlanChecklist plan={plan} /> : null}

      {isSending ? <ThoughtBlock reasoning={streamedReasoning} steps={streamSteps} live /> : null}

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
    </>
  )
}
