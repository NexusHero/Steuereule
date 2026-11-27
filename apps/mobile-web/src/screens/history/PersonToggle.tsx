import { Pressable, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme, type UiTheme, controlLine } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import type { HistoryPerson } from './historyFormat'

/** „Wir beide · Person A · Person B“ (ADR-0098 §6): for Brutto → Netto and Werbungskosten. */
export function PersonToggle({ person, onChange }: { readonly person: HistoryPerson; readonly onChange: (p: HistoryPerson) => void }) {
  const t = useTheme()
  const s = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  return (
    <View style={s.segment} accessibilityRole="radiogroup" accessibilityLabel={tr('verlauf.person.fuerWen')} testID="verlauf-person">
      {(['beide', 'A', 'B'] as const).map((p) => {
        const active = p === person
        return (
          <Pressable key={p} accessibilityRole="radio" accessibilityState={{ checked: active }} onPress={() => onChange(p)} style={[s.segmentButton, active ? s.segmentActive : null]} testID={`verlauf-person-${p}`}>
            <Text style={[s.segmentText, active ? s.segmentTextActive : null]}>{tr(`verlauf.person.${p}`)}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function makeStyles(t: UiTheme) {
  const segment: ViewStyle = { flexDirection: 'row', alignSelf: 'flex-start', borderWidth: t.space.kontur, borderColor: controlLine(t), borderRadius: t.radius.pille, backgroundColor: t.color.karte, padding: 3, gap: 2 }
  const segmentButton: ViewStyle = { borderRadius: t.radius.pille, paddingHorizontal: t.space.s3, paddingVertical: 6, minHeight: 36, justifyContent: 'center' }
  const segmentActive: ViewStyle = { backgroundColor: t.color.funke }
  const segmentText: TextStyle = { ...t.type.label, color: t.color.tinte }
  const segmentTextActive: TextStyle = { color: t.color.nacht }
  return { segment, segmentButton, segmentActive, segmentText, segmentTextActive }
}
