import { useState } from 'react'
import { Pressable, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { Icon } from '../../icons/Icon'

interface BetaNoticeProps {
  /**
   * The mark instead of the paragraph: a small BETA badge that opens the same notice on a tap. For
   * the sign-in screen, which every visit starts with; where a decision follows (registration, the
   * profile, before a payment or a printout) the notice stays written out (WEB-20).
   */
  readonly compact?: boolean
}

/** The beta notice (WEB-20): on sign-in, registration, the profile and before every payment. */
export function BetaNotice({ compact = false }: BetaNoticeProps = {}) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const [open, setOpen] = useState(false)
  const box: ViewStyle = { backgroundColor: t.color.warnWeich, borderRadius: t.radius.s, padding: t.space.s3, marginBottom: t.space.s4 }
  const notice = (
    <Text style={{ ...t.type.small, color: t.color.tinte }}>
      <Text style={{ ...t.type.label, color: t.color.tinte }}>{tr('beta.label')} </Text>
      {tr('beta.notice')}
    </Text>
  )
  if (!compact) {
    return (
      <View role="note" style={box} testID="beta-hinweis">
        {notice}
      </View>
    )
  }
  const badge: ViewStyle = {
    alignSelf: 'center',
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.s2,
    paddingHorizontal: t.space.s3,
    marginBottom: t.space.s3,
  }
  const pill: ViewStyle = { borderWidth: t.space.kontur, borderColor: t.color.linie, borderRadius: t.radius.s, paddingHorizontal: t.space.s2, paddingVertical: 2 }
  const pillText: TextStyle = { ...t.type.meta, color: t.color.tinte2, letterSpacing: 0.08 * t.size.xs }
  return (
    <View role="note" testID="beta-hinweis">
      <Pressable accessibilityRole="button" aria-expanded={open} accessibilityLabel={tr('beta.badgeHint')} onPress={() => setOpen((v) => !v)} style={badge} testID="beta-marke">
        <View style={pill}>
          <Text style={pillText}>{tr('beta.badge')}</Text>
        </View>
        <Icon name="info" size={18} color={t.color.tinte2} />
      </Pressable>
      {open ? <View style={box}>{notice}</View> : null}
    </View>
  )
}
