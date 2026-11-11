import { useState } from 'react'
import { Pressable, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../../../i18n/resources'

export interface ThoughtBlockProps {
  /** The provider's reasoning summary; absent for models that supply none. */
  readonly reasoning?: string | undefined
  /** What the owl reported doing: status lines and tool labels. */
  readonly steps?: readonly string[] | undefined
  /** True while the answer is still being written: the block is open and says so. */
  readonly live?: boolean | undefined
}

/** One generic status line on every answer is not a line of thought. */
export function hasThought(reasoning: string | undefined, steps: readonly string[] | undefined): boolean {
  return (reasoning?.trim().length ?? 0) > 0 || (steps?.length ?? 0) >= 2
}

/**
 * The owl's line of thought (#476): the steps it took and, where the model supplies one, its
 * reasoning summary. Open while the owl works, collapsed afterwards. Marked as the AI's
 * considerations, because none of it is advice.
 */
export function ThoughtBlock({ reasoning, steps = [], live = false }: ThoughtBlockProps) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const [expanded, setExpanded] = useState(false)
  if (!hasThought(reasoning, steps)) return null

  const open = live || expanded
  const text = reasoning?.trim() ?? ''
  const heading = live ? tr('advisor.chat.thought.headingLive') : tr('advisor.chat.thought.heading')
  const count = steps.length > 0 ? ` · ${tr('advisor.chat.thought.steps', { count: steps.length })}` : ''

  return (
    <View style={styles.box} testID="advisor-thought">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={open ? tr('advisor.chat.thought.hide') : tr('advisor.chat.thought.show')}
        aria-expanded={open}
        disabled={live}
        onPress={() => setExpanded((prev) => !prev)}
        style={styles.header}
        testID="advisor-thought-toggle"
      >
        <Text style={styles.heading}>{`${heading}${count}`}</Text>
        {live ? null : <Text style={styles.chevron}>{open ? '▾' : '▸'}</Text>}
      </Pressable>
      {open ? (
        <View style={styles.body} testID="advisor-thought-body">
          {steps.map((step, index) => (
            <Text key={`${index}-${step}`} style={styles.step} testID="advisor-thought-step">
              {`· ${step}`}
            </Text>
          ))}
          {text.length > 0 ? (
            <Text style={styles.reasoning} testID="advisor-thought-reasoning">
              {text}
            </Text>
          ) : null}
          <Text style={styles.note} testID="advisor-thought-note">
            {tr('advisor.chat.thought.note')}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

function makeStyles(t: UiTheme) {
  return {
    box: {
      borderLeftWidth: 2,
      borderLeftColor: t.color.kiLinie,
      paddingLeft: t.space.s3,
      marginBottom: t.space.s3,
    } as ViewStyle,
    header: { flexDirection: 'row', alignItems: 'center', gap: t.space.s2, paddingVertical: 2 } as ViewStyle,
    heading: { fontFamily: t.font.text, fontSize: t.size.xs, fontWeight: t.weight.fett, color: t.color.ki } as TextStyle,
    chevron: { fontFamily: t.font.text, fontSize: t.size.xs, color: t.color.ki } as TextStyle,
    body: { marginTop: t.space.s1, gap: t.space.s1 } as ViewStyle,
    step: { fontFamily: t.font.text, fontSize: t.size.xs, color: t.color.tinte2 } as TextStyle,
    reasoning: { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte2, fontStyle: 'italic' } as TextStyle,
    note: { fontFamily: t.font.text, fontSize: t.size.xs, color: t.color.tinte2, marginTop: t.space.s1 } as TextStyle,
  }
}
