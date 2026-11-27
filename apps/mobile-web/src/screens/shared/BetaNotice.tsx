import { Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'

/**
 * The beta notice (WEB-20), written out: on registration, the profile and before every payment or
 * printout, where a decision follows. The sign-in screen carries `BetaBadge` beside the name instead.
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

/** The word BETA as a small mark beside the brand name: says the stage, explains nothing. */
export function BetaBadge() {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const pill: ViewStyle = { borderWidth: t.space.kontur, borderColor: t.color.linie, borderRadius: t.radius.s, paddingHorizontal: t.space.s2, paddingVertical: 2 }
  const text: TextStyle = { ...t.type.meta, color: t.color.tinte2, letterSpacing: 0.08 * t.size.xs }
  return (
    <View style={pill} testID="beta-marke">
      <Text style={text}>{tr('beta.badge')}</Text>
    </View>
  )
}
