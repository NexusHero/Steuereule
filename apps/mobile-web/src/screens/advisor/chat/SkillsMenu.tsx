import { useState } from 'react'
import { Pressable, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { ADVISOR_SKILL_IDS, type AdvisorSkillId } from '@steuereule/core'
import { useTheme, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../../../i18n/resources'

export interface SkillsMenuProps {
  /** The skill that is on for the next messages, if any. One at a time. */
  readonly active: AdvisorSkillId | null
  readonly onChange: (next: AdvisorSkillId | null) => void
  readonly disabled?: boolean | undefined
}

/**
 * The skills of the owl (#495): ways of working that ship with the app. The user turns one on and
 * off here; the skill does not widen what the owl may write.
 */
export function SkillsMenu({ active, onChange, disabled = false }: SkillsMenuProps) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const [open, setOpen] = useState(false)

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open, disabled }}
        accessibilityLabel={tr('advisor.chat.skills.aria')}
        aria-expanded={open}
        disabled={disabled}
        onPress={() => setOpen((prev) => !prev)}
        style={[styles.pill, active !== null && styles.pillOn]}
        testID="advisor-skills-toggle"
      >
        <Text style={[styles.label, active !== null && styles.labelOn]} numberOfLines={1}>
          {active === null ? tr('advisor.chat.skills.label') : tr(`advisor.chat.skills.items.${active}.title`)}
        </Text>
      </Pressable>
      {open ? (
        <View style={styles.panel} testID="advisor-skills-panel">
          <Text style={styles.heading} role="heading" aria-level={2}>
            {tr('advisor.chat.skills.title')}
          </Text>
          <Text style={styles.help}>{tr('advisor.chat.skills.help')}</Text>
          {ADVISOR_SKILL_IDS.map((id) => {
            const on = active === id
            return (
              <Pressable
                key={id}
                accessibilityRole="switch"
                accessibilityState={{ checked: on }}
                aria-checked={on}
                onPress={() => {
                  onChange(on ? null : id)
                  setOpen(false)
                }}
                style={[styles.row, on && styles.rowOn]}
                testID={`advisor-skill-${id}`}
              >
                <Text style={styles.name}>{tr(`advisor.chat.skills.items.${id}.title`)}</Text>
                <Text style={styles.help}>{tr(`advisor.chat.skills.items.${id}.description`)}</Text>
                <Text style={[styles.state, on && styles.stateOn]}>{tr(on ? 'advisor.chat.skills.on' : 'advisor.chat.skills.off')}</Text>
              </Pressable>
            )
          })}
        </View>
      ) : null}
    </View>
  )
}

function makeStyles(t: UiTheme) {
  return {
    pill: {
      minHeight: 32,
      maxWidth: 160,
      paddingHorizontal: t.space.s3,
      borderRadius: t.radius.m,
      borderWidth: 1,
      borderColor: t.color.linie,
      backgroundColor: t.color.karte,
      justifyContent: 'center',
    } as ViewStyle,
    pillOn: { borderColor: t.color.ki, backgroundColor: t.color.kiWeich } as ViewStyle,
    label: { fontFamily: t.font.text, fontWeight: t.weight.fett, fontSize: t.size.s, color: t.color.tinte2 } as TextStyle,
    labelOn: { color: t.color.kiTinte } as TextStyle,
    panel: {
      position: 'absolute',
      bottom: 40,
      right: 0,
      width: 300,
      gap: t.space.s2,
      padding: t.space.s3,
      borderRadius: t.radius.m,
      borderWidth: 1,
      borderColor: t.color.linie,
      backgroundColor: t.color.karte,
    } as ViewStyle,
    heading: { fontFamily: t.font.text, fontWeight: t.weight.fett, fontSize: t.size.m, color: t.color.tinte } as TextStyle,
    help: { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte2 } as TextStyle,
    row: { gap: t.space.s1, padding: t.space.s3, borderRadius: t.radius.m, borderWidth: 1, borderColor: t.color.linie, minHeight: 44 } as ViewStyle,
    rowOn: { borderColor: t.color.ki, backgroundColor: t.color.kiWeich } as ViewStyle,
    name: { fontFamily: t.font.text, fontWeight: t.weight.fett, fontSize: t.size.m, color: t.color.tinte } as TextStyle,
    state: { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte2 } as TextStyle,
    stateOn: { color: t.color.kiTinte, fontWeight: t.weight.fett } as TextStyle,
  }
}
