import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { describeModelFailure, fallbackNotice, type AdvisorModelFailure } from '@steuereule/core'
import { useTheme } from '@steuereule/ui'
import { APP_NS } from '../../../i18n/resources'
import { makeStyles } from '../AdvisorChatPanel.styles'

export interface ModelFailureNoticeProps {
  readonly failure: AdvisorModelFailure
  /** True when what stands above came from the fixed rules instead of the model. */
  readonly answeredByRules: boolean
  /** Asks the same question again; absent when this is not the latest turn. */
  readonly onRetry?: (() => void) | undefined
}

/**
 * Says why the language model did not answer (#487), in words, and keeps saying it after a reload.
 * A refused key is no use retrying, so there the button is left out.
 */
export function ModelFailureNotice({ failure, answeredByRules, onRetry }: ModelFailureNoticeProps) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const view = describeModelFailure(failure.reason)
  return (
    <View style={styles.notStagedBox} testID="advisor-model-failure" accessibilityRole="alert">
      <Text style={styles.notStagedTitle}>{tr('advisor.chat.modelFailure.title')}</Text>
      <Text style={styles.notStagedLine} testID="advisor-model-failure-text">
        {answeredByRules ? fallbackNotice(failure) : view.text}
      </Text>
      {failure.detail ? (
        <Text style={styles.notStagedLine} testID="advisor-model-failure-detail">
          {tr('advisor.chat.modelFailure.detail', { detail: failure.detail })}
        </Text>
      ) : null}
      {view.retryable && onRetry ? (
        <Pressable accessibilityRole="button" onPress={onRetry} style={styles.choicePill} testID="advisor-model-failure-retry">
          <Text style={styles.choicePillText}>{tr('advisor.chat.modelFailure.retry')}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}
