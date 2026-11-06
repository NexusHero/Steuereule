import { useState } from 'react'
import { Pressable, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Card, Chip, useTheme, type UiTheme } from '@steuereule/ui'
import { PROFESSION_VALUES, type Profession } from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'

/** i18n keys per occupation group — the stored value stays the core's German enum value. */
const PROFESSION_LABEL_KEYS: Record<Profession, string> = {
  'IT & Software': 'interview.beruf.options.it',
  'Pflege & Gesundheit': 'interview.beruf.options.pflege',
  'Lehrkraft & Erziehung': 'interview.beruf.options.lehre',
  'Handwerk & Technik': 'interview.beruf.options.handwerk',
  'Büro & Verwaltung': 'interview.beruf.options.buero',
  'Vertrieb & Außendienst': 'interview.beruf.options.vertrieb',
  'Ausbildung oder Studium': 'interview.beruf.options.ausbildung',
  'Etwas anderes': 'interview.beruf.options.anderes',
}

export interface ProfessionPickerProps {
  /** The stored occupation group, or null when none is chosen yet. */
  readonly profession: Profession | null
  readonly onChoose: (profession: Profession) => Promise<void> | void
  readonly saving?: boolean
}

/**
 * "Was machst du beruflich?" — asked where the advice lives, not in the Minimal-Gate (ADR-0045:
 * value first). One tap, coarse groups only; the owl's profession tips follow from it.
 * Facts about the user, not AI output — so ink and lime, never violet.
 */
export function ProfessionPicker({ profession, onChoose, saving = false }: ProfessionPickerProps) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const [editing, setEditing] = useState(profession === null)
  const [failed, setFailed] = useState(false)

  if (profession !== null && !editing) {
    return (
      <View style={styles.summaryRow} testID="beruf-summary">
        <Text style={styles.summaryText}>
          {tr('eule.beruf.summary', { beruf: tr(PROFESSION_LABEL_KEYS[profession]), defaultValue: `Tipps für: ${profession}` })}
        </Text>
        <Pressable accessibilityRole="button" onPress={() => setEditing(true)} hitSlop={12}>
          <Text style={styles.change}>{tr('eule.beruf.change', 'Ändern')}</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <Card style={styles.card} testID="beruf-picker">
      <Text style={styles.title} role="heading" aria-level={2}>
        {tr('interview.beruf.titleBefore')}
        <Text style={styles.mark}>{tr('interview.beruf.titleMark')}</Text>
        {tr('interview.beruf.titleAfter')}
      </Text>
      <Text style={styles.help}>{tr('interview.beruf.help')}</Text>
      <View style={styles.chips}>
        {PROFESSION_VALUES.map((value) => (
          <Chip
            key={value}
            active={value === profession}
            onPress={() => {
              if (saving) return
              void (async () => {
                setFailed(false)
                try {
                  await onChoose(value)
                  setEditing(false)
                } catch {
                  // never a silent no-op: the choice was not stored, so say so and keep the picker open
                  setFailed(true)
                }
              })()
            }}
            testID={`beruf-${value}`}
          >
            {tr(PROFESSION_LABEL_KEYS[value])}
          </Chip>
        ))}
      </View>
      {failed ? (
        <Text style={styles.error} role="alert" testID="beruf-error">
          {tr('eule.beruf.error', 'Das hat nicht geklappt — dein Beruf ist noch nicht gespeichert. Versuch es noch einmal.')}
        </Text>
      ) : null}
    </Card>
  )
}

function makeStyles(t: UiTheme) {
  const card: ViewStyle = { borderWidth: 2, borderColor: t.color.tinte }
  const title: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size.xl,
    color: t.color.tinte,
    marginBottom: t.space.s1,
  }
  const mark: TextStyle = { color: t.color.funkeTinte }
  const help: TextStyle = { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte2, marginBottom: t.space.s3 }
  const chips: ViewStyle = { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2 }
  const summaryRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.space.s3, marginBottom: t.space.s4 }
  const summaryText: TextStyle = { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte2, flexShrink: 1 }
  const change: TextStyle = { fontFamily: t.font.text, fontSize: t.size.s, fontWeight: t.weight.fett, color: t.color.funkeTinte }
  const error: TextStyle = { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.fehler, marginTop: t.space.s3 }
  return { card, title, mark, help, chips, summaryRow, summaryText, change, error }
}
