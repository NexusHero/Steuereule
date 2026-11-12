import { Pressable, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../../../i18n/resources'

export interface TurboToggleProps {
  readonly on: boolean
  readonly onChange: (next: boolean) => void
  /** No switching while an answer is being written. */
  readonly disabled?: boolean | undefined
}

/**
 * Turbo mode (#491): off, the owl prepares drafts and waits for a click; on, it applies them itself
 * and says what it changed. A switch at the input, off in every new chat, so the careful way stays
 * the default.
 */
export function TurboToggle({ on, onChange, disabled = false }: TurboToggleProps) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on, disabled }}
      accessibilityLabel={tr('advisor.chat.turbo.aria')}
      accessibilityHint={tr(on ? 'advisor.chat.turbo.hintOn' : 'advisor.chat.turbo.hintOff')}
      aria-checked={on}
      disabled={disabled}
      onPress={() => onChange(!on)}
      style={[styles.pill, on && styles.pillOn]}
      testID="advisor-turbo-toggle"
    >
      <Text style={[styles.label, on && styles.labelOn]}>{tr('advisor.chat.turbo.label')}</Text>
    </Pressable>
  )
}

/** Under an answer the owl applied itself: what happened, and that every change can be taken back. */
export function TurboSummary({ count }: { readonly count: number }) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  return (
    <View style={styles.summary} testID="advisor-turbo-summary">
      <Text style={styles.summaryText}>{tr('advisor.chat.turbo.summary', { count })}</Text>
    </View>
  )
}

function makeStyles(t: UiTheme) {
  return {
    pill: {
      minHeight: 32,
      paddingHorizontal: t.space.s3,
      borderRadius: t.radius.m,
      borderWidth: 1,
      borderColor: t.color.linie,
      backgroundColor: t.color.karte,
      justifyContent: 'center',
    } as ViewStyle,
    pillOn: { borderColor: t.color.ki, backgroundColor: t.color.kiWeich } as ViewStyle,
    label: { fontFamily: t.font.text, fontWeight: t.weight.fett, fontSize: t.size.s, color: t.color.tinte2 } as TextStyle,
    labelOn: { color: t.color.kiTinte } as TextStyle,
    summary: {
      paddingVertical: t.space.s2,
      paddingHorizontal: t.space.s3,
      borderRadius: t.radius.m,
      backgroundColor: t.color.kiWeich,
    } as ViewStyle,
    summaryText: { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.kiTinte } as TextStyle,
  }
}
