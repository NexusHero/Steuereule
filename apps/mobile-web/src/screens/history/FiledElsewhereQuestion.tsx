import { Pressable, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { useTheme, type UiTheme } from '@steuereule/ui'
import { getYearHistoryControllerGetQueryKey, useFiledElsewhereControllerAnswer, type PutFiledElsewhereDtoAnswer } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'

export interface FiledElsewhereQuestionProps {
  readonly year: number
  /** `nacht` inside the cockpit's dark block, `hell` on a card or a timeline row. */
  readonly tone: 'nacht' | 'hell'
  readonly testID: string
}

const ANSWERS: readonly { readonly answer: PutFiledElsewhereDtoAnswer; readonly key: 'ja' | 'nein' | 'weissNicht' }[] = [
  { answer: 'ja', key: 'ja' },
  { answer: 'nein', key: 'nein' },
  { answer: 'weiss-nicht', key: 'weissNicht' },
]

/**
 * „Schon abgegeben?“ for a year of the Festsetzungsfrist without data (ADR-0099 §1), asked once:
 * `Ja` waits for the Bescheid upload, `Nein` makes it an open year, `Weiß nicht` asks again three months
 * before the deadline. The answer goes to `PUT /v1/steuerjahre/:jahr/abgabe-anderswo`; the Verlauf reloads.
 */
export function FiledElsewhereQuestion({ year, tone, testID }: FiledElsewhereQuestionProps) {
  const t = useTheme()
  const s = makeStyles(t, tone)
  const { t: tr } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const answer = useFiledElsewhereControllerAnswer({
    mutation: {
      onSuccess: (res) => {
        if (res.status === 200) void queryClient.invalidateQueries({ queryKey: getYearHistoryControllerGetQueryKey() })
      },
    },
  })
  const failed = answer.isError || (answer.data !== undefined && answer.data.status !== 200)
  return (
    <View style={s.wrap} testID={testID}>
      <View style={s.row} role="group" accessibilityLabel={tr('verlauf.frage.gruppe', { jahr: year })}>
        {ANSWERS.map((a) => (
          <Pressable
            key={a.key}
            accessibilityRole="button"
            accessibilityLabel={tr(`verlauf.frage.${a.key}A11y`, { jahr: year })}
            disabled={answer.isPending}
            onPress={() => answer.mutate({ jahr: year, data: { answer: a.answer } })}
            style={({ pressed }) => [s.button, pressed || answer.isPending ? s.pressed : null]}
            testID={`${testID}-${a.answer}`}
          >
            <Text style={s.label}>{tr(`verlauf.frage.${a.key}`)}</Text>
          </Pressable>
        ))}
      </View>
      {failed ? (
        <Text style={s.error} accessibilityRole="alert" testID={`${testID}-fehler`}>
          {tr('verlauf.frage.fehler')}
        </Text>
      ) : null}
    </View>
  )
}

function makeStyles(t: UiTheme, tone: 'nacht' | 'hell') {
  const ink = tone === 'nacht' ? t.color.nachtText : t.color.tinte
  const wrap: ViewStyle = { gap: t.space.s1 }
  const row: ViewStyle = { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2 }
  const button: ViewStyle = {
    minHeight: 44,
    minWidth: 64,
    paddingHorizontal: t.space.s4,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: t.radius.pille,
    borderWidth: t.space.kontur,
    borderColor: tone === 'nacht' ? t.color.nachtText : t.color.tinte2,
    backgroundColor: tone === 'nacht' ? 'transparent' : t.color.karte,
  }
  const pressed: ViewStyle = { opacity: 0.7 }
  const label: TextStyle = { ...t.type.labelStrong, color: ink }
  const error: TextStyle = { ...t.type.small, color: tone === 'nacht' ? t.color.nachtText : t.color.fehler }
  return { wrap, row, button, pressed, label, error }
}
