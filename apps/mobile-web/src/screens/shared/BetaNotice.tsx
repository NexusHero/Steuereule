import { Pressable, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { controlLine, useTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'

/**
 * The beta notice (WEB-20), written out: on registration, the profile and before every payment or
 * printout, where a decision follows. The sign-in screen carries `BetaBadge` beside the name and shows
 * this text when the mark is pressed.
 */
export function BetaNotice() {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  return (
    <View
      role="note"
      style={{ backgroundColor: t.color.warnWeich, borderRadius: t.radius.s, padding: t.space.s3, marginBottom: t.space.s4 }}
      testID="beta-hinweis"
    >
      <Text style={{ ...t.type.small, color: t.color.tinte }}>
        <Text style={{ ...t.type.label, color: t.color.tinte }}>{tr('beta.label')} </Text>
        {tr('beta.notice')}
      </Text>
    </View>
  )
}

/**
 * The word BETA as a small mark beside the brand name. It says the stage in one word and opens the
 * written-out notice on demand: the caller renders `BetaNotice` while `open` is true.
 */
export function BetaBadge({ open, onToggle }: { readonly open: boolean; readonly onToggle: () => void }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const pill: ViewStyle = { borderWidth: t.space.kontur, borderColor: controlLine(t), borderRadius: t.radius.s, paddingHorizontal: t.space.s2, paddingVertical: 2 }
  const text: TextStyle = { ...t.type.meta, color: t.color.tinte2, letterSpacing: 0.08 * t.size.xs }
  return (
    // The mark is small on purpose; the slop makes the touch target 44 px without making it louder.
    <Pressable accessibilityRole="button" aria-label={tr('beta.badgeLabel')} aria-expanded={open} onPress={onToggle} hitSlop={TOUCH_SLOP} style={pill} testID="beta-marke">
      <Text style={text}>{tr('beta.badge')}</Text>
    </Pressable>
  )
}

const TOUCH_SLOP = 12
