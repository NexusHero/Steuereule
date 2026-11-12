import { useState } from 'react'
import { Pressable, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme, type UiTheme } from '@steuereule/ui'
import {
  ADVISOR_FEEDBACK_REASONS,
  type AdvisorFeedbackRating,
  type AdvisorFeedbackReason,
  type AdvisorMessageFeedback,
} from '@steuereule/core'
import { APP_NS } from '../../../i18n/resources'

export interface FeedbackButtonsProps {
  readonly feedback: AdvisorMessageFeedback | null | undefined
  /** Resolves when the rating is stored; `null` removes it. A rejection is shown, not swallowed. */
  readonly onRate: (rating: AdvisorFeedbackRating | null, reason?: AdvisorFeedbackReason) => Promise<void> | void
}

/**
 * Thumbs up / down under an answer (#476). Pressing the active thumb removes the rating. A thumbs
 * down counts at once; the reason is an optional second tap from a fixed list, never free text.
 */
export function FeedbackButtons({ feedback, onRate }: FeedbackButtonsProps) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const [failed, setFailed] = useState(false)
  const [thanked, setThanked] = useState(false)
  const rating = feedback?.rating ?? null

  async function rate(next: AdvisorFeedbackRating | null, reason?: AdvisorFeedbackReason) {
    setFailed(false)
    try {
      await onRate(next, reason)
      setThanked(next !== null)
    } catch {
      setFailed(true)
    }
  }

  return (
    <View style={styles.wrap} testID="advisor-feedback">
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr('advisor.chat.feedback.upAria')}
          aria-pressed={rating === 'up'}
          onPress={() => void rate(rating === 'up' ? null : 'up')}
          style={[styles.thumb, rating === 'up' && styles.thumbActive]}
          testID="advisor-feedback-up"
        >
          <Text style={styles.thumbText}>👍</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr('advisor.chat.feedback.downAria')}
          aria-pressed={rating === 'down'}
          onPress={() => void rate(rating === 'down' ? null : 'down')}
          style={[styles.thumb, rating === 'down' && styles.thumbActive]}
          testID="advisor-feedback-down"
        >
          <Text style={styles.thumbText}>👎</Text>
        </Pressable>
      </View>
      {rating === 'down' ? (
        <View style={styles.reasons} testID="advisor-feedback-reasons">
          <Text style={styles.prompt}>{tr('advisor.chat.feedback.reasonPrompt')}</Text>
          <View style={styles.row}>
            {ADVISOR_FEEDBACK_REASONS.map((reason) => (
              <Pressable
                key={reason}
                accessibilityRole="button"
                aria-pressed={feedback?.reason === reason}
                onPress={() => void rate('down', reason)}
                style={[styles.reason, feedback?.reason === reason && styles.thumbActive]}
                testID={`advisor-feedback-reason-${reason}`}
              >
                <Text style={styles.reasonText}>{tr(`advisor.chat.feedback.reasons.${reason}`)}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      {failed ? (
        <Text style={styles.failed} role="alert" testID="advisor-feedback-failed">
          {tr('advisor.chat.feedback.failed')}
        </Text>
      ) : thanked && rating !== null ? (
        <Text style={styles.prompt} accessibilityLiveRegion="polite" aria-live="polite" testID="advisor-feedback-thanks">
          {tr('advisor.chat.feedback.thanks')}
        </Text>
      ) : null}
    </View>
  )
}

function makeStyles(t: UiTheme) {
  return {
    wrap: { gap: t.space.s1 } as ViewStyle,
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2, alignItems: 'center' } as ViewStyle,
    thumb: {
      minWidth: 32,
      minHeight: 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: t.radius.m,
      borderWidth: 1,
      borderColor: 'transparent',
    } as ViewStyle,
    thumbActive: { backgroundColor: t.color.kiWeich, borderColor: t.color.kiLinie } as ViewStyle,
    thumbText: { fontSize: t.size.s } as TextStyle,
    reasons: { gap: t.space.s1 } as ViewStyle,
    reason: {
      paddingVertical: t.space.s1,
      paddingHorizontal: t.space.s3,
      borderRadius: t.radius.m,
      borderWidth: 1,
      borderColor: t.color.kiLinie,
    } as ViewStyle,
    reasonText: { fontFamily: t.font.text, fontSize: t.size.xs, color: t.color.tinte } as TextStyle,
    prompt: { fontFamily: t.font.text, fontSize: t.size.xs, color: t.color.tinte2 } as TextStyle,
    failed: { fontFamily: t.font.text, fontSize: t.size.xs, color: t.color.fehler } as TextStyle,
  }
}
