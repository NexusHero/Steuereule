import { Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { useApiFailureMessage } from '../../net/apiFailure'

/**
 * Shown when a mask could not save an entry (WEB-12). With the failed request's error it says why, in the
 * shared wording (a 429 names its wait, an expired session says so); the typed value stays in the field.
 */
export function SaveFailedNotice({ visible, error }: { readonly visible: boolean; readonly error?: unknown }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const failureMessage = useApiFailureMessage()
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
      {error === undefined || error === null ? (
        <Text style={text}>{tr('shared.saveFailed')}</Text>
      ) : (
        <Text style={text}>{`${tr('apiFehler.saveHeading')} ${failureMessage(error)} ${tr('apiFehler.saveKept')}`}</Text>
      )}
    </View>
  )
}
