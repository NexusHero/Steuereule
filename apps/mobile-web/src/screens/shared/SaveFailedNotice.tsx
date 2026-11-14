import { Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'

/** Shown when a mask could not save an entry; the next press leaves the mask anyway. */
export function SaveFailedNotice({ visible }: { readonly visible: boolean }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  if (!visible) return null
  const box: ViewStyle = {
    borderWidth: t.space.kontur,
    borderColor: t.color.fehler,
    borderRadius: t.radius.m,
    backgroundColor: t.color.karte,
    padding: t.space.s3,
    marginVertical: t.space.s3,
  }
  const text: TextStyle = { ...t.type.small, color: t.color.tinte }
  return (
    <View accessibilityRole="alert" style={box} testID="speichern-fehlgeschlagen">
      <Text style={text}>{tr('shared.saveFailed')}</Text>
    </View>
  )
}
