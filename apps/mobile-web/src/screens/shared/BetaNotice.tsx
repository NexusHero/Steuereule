import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'

/** The beta notice (WEB-20): on sign-in, registration, the profile and before every payment. */
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
