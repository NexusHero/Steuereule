import { useState } from 'react'
import { Pressable, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../../../i18n/resources'
import type { AdvisorPlanView, PlanStepView } from '../CopilotBridgeProvider'

const GLYPH: Readonly<Record<PlanStepView['status'], string>> = {
  offen: '○',
  laeuft: '◐',
  erledigt: '✓',
  abgebrochen: '■',
}

/**
 * The owl's plan above its answer (#451 decision 18): ○ offen, ◐ läuft, ✓ erledigt, live while it
 * works; afterwards collapsed to „5 Schritte erledigt ▸“. A view only: it never writes (decision 19).
 */
export function PlanChecklist({ plan }: { readonly plan: AdvisorPlanView }) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const [expanded, setExpanded] = useState(false)
  const done = plan.steps.filter((s) => s.status === 'erledigt').length
  // A stopped plan stays open: what was done and what was cut off must stay visible (AC 14).
  const collapsible = plan.finished && !plan.steps.some((s) => s.status === 'abgebrochen')
  const open = !collapsible || expanded

  return (
    <View style={styles.box} testID="advisor-plan" accessibilityLabel={tr('advisor.plan.heading')}>
      {collapsible ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          onPress={() => setExpanded((prev) => !prev)}
          testID="advisor-plan-toggle"
        >
          <Text style={styles.toggle}>
            {done === plan.steps.length
              ? tr('advisor.plan.summaryAll', { count: done })
              : tr('advisor.plan.summary', { count: done, total: plan.steps.length })}{' '}
            {open ? '▾' : '▸'}
          </Text>
        </Pressable>
      ) : (
        <Text style={styles.heading}>{tr('advisor.plan.heading')}</Text>
      )}
      {open
        ? plan.steps.map((step, index) => (
            <View key={`${index}-${step.text}`} style={styles.row} testID={`advisor-plan-step-${index + 1}`} accessibilityLabel={`${step.text}: ${tr(`advisor.plan.status.${step.status}`)}`}>
              <Text style={[styles.glyph, step.status === 'erledigt' && styles.glyphDone]} aria-hidden>
                {GLYPH[step.status]}
              </Text>
              <Text style={[styles.text, step.status === 'abgebrochen' && styles.textAborted]}>
                {step.text}
                {step.status === 'abgebrochen' ? ` · ${tr('advisor.plan.status.abgebrochen')}` : ''}
              </Text>
            </View>
          ))
        : null}
    </View>
  )
}

function makeStyles(t: UiTheme) {
  return {
    box: {
      gap: t.space.s1,
      padding: t.space.s3,
      borderRadius: t.radius.m,
      borderWidth: 1,
      borderColor: t.color.linieWeich,
      backgroundColor: t.color.karte,
      marginBottom: t.space.s2,
    } as ViewStyle,
    heading: { fontFamily: t.font.text, fontWeight: t.weight.fett, fontSize: t.size.s, color: t.color.tinte } as TextStyle,
    toggle: { fontFamily: t.font.text, fontWeight: t.weight.fett, fontSize: t.size.s, color: t.color.ki } as TextStyle,
    row: { flexDirection: 'row', gap: t.space.s2, alignItems: 'flex-start' } as ViewStyle,
    glyph: { width: 16, fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte2 } as TextStyle,
    glyphDone: { color: t.color.ki } as TextStyle,
    text: { flex: 1, fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte } as TextStyle,
    textAborted: { color: t.color.tinte2 } as TextStyle,
  }
}
