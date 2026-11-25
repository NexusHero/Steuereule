import { Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, useTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { useApiFailureMessage } from '../../net/apiFailure'

/**
 * A secondary part of a mask did not load (NM-15): said where the part would be, with the reason and a retry —
 * never a silently missing question, a default choice or an empty list in its place.
 */
export function InlineLoadFailure({
  what,
  error,
  onRetry,
  testID,
}: {
  /** What did not load, as a sentence („Die Veranlagungsart konnte nicht geladen werden.“). */
  readonly what: string
  readonly error: unknown
  readonly onRetry: () => void
  readonly testID?: string
}) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const failureMessage = useApiFailureMessage()
  const box: ViewStyle = {
    borderWidth: t.space.kontur,
    borderColor: t.color.fehler,
    borderRadius: t.radius.m,
    padding: t.space.s3,
    marginVertical: t.space.s3,
    gap: t.space.s2,
  }
  const text: TextStyle = { ...t.type.small, color: t.color.tinte }
  return (
    <View style={box} testID={testID ?? 'teil-fehler'}>
      <Text style={text} accessibilityRole="alert">{`${what} ${failureMessage(error)}`}</Text>
      <Button variant="leise" onPress={onRetry} testID={`${testID ?? 'teil-fehler'}-erneut`}>
        {tr('apiFehler.retry')}
      </Button>
    </View>
  )
}
