import { useEffect, useState } from 'react'
import { Pressable, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme, type UiTheme } from '@steuereule/ui'
import type { AdvisorThoughtStep } from '@steuereule/core'
import { APP_NS } from '../../../i18n/resources'
import { StrokeIcon, type StrokeIconName } from '../../../icons/StrokeIcon'
import { ThinkingGlyph } from './ThinkingGlyph'
import { THINKING_PHRASE_COUNT, THINKING_PHRASE_INTERVAL_MS, thinkingLabelAt } from './thinkingLabel'

export interface ThoughtBlockProps {
  /** The provider's reasoning summary; absent for models that supply none. */
  readonly reasoning?: string | undefined
  /** What the owl did, step by step, and what each tool found. */
  readonly steps?: readonly AdvisorThoughtStep[] | undefined
  /** How long the owl worked on a finished answer, in milliseconds. */
  readonly durationMs?: number | undefined
  /** True while the answer is still being written: the line counts up and shows the current step. */
  readonly live?: boolean | undefined
}

/** One generic status line on every answer is not a line of thought. */
export function hasThought(reasoning: string | undefined, steps: readonly AdvisorThoughtStep[] | undefined): boolean {
  return (reasoning?.trim().length ?? 0) > 0 || (steps?.length ?? 0) >= 2
}

const TOOL_ICONS: Readonly<Record<string, StrokeIconName>> = {
  simulate_tax_delta: 'calculator',
  compute_income_tax: 'calculator',
  stage_field_draft: 'draft',
  propose_two_paths: 'compare',
  ask_clarification: 'question',
  ask_questions: 'question',
  suggest_situation: 'pencil',
  lookup_tax_knowledge: 'book',
  lookup_legal_source: 'book',
  plan_steps: 'list',
  remember_note: 'note',
  replace_note: 'note',
  forget_note: 'note',
}

const iconOf = (step: AdvisorThoughtStep): StrokeIconName => (step.kind === 'status' ? 'status' : (TOOL_ICONS[step.tool ?? ''] ?? 'check'))

/** A finished step reads as what was done, not as an ongoing "…". */
const doneLabel = (label: string): string => label.replace(/\s*…\s*$/, '')

const seconds = (ms: number): number => Math.max(1, Math.round(ms / 1000))

/**
 * The owl's line of thought (#476), shaped like Claude's: one quiet line, "Nachgedacht · 8 s ·
 * 4 Schritte", that opens to the steps with an icon each, what each tool found, and the reasoning
 * summary. While the owl works the line counts up and shows the current step; it can be opened
 * then too. Marked as the AI's considerations, because none of it is advice.
 */
export function ThoughtBlock({ reasoning, steps = [], durationMs, live = false }: ThoughtBlockProps) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const [expanded, setExpanded] = useState(false)
  const [startedAt] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())
  const [lastStepAt, setLastStepAt] = useState<number | null>(null)
  const [seenSteps, setSeenSteps] = useState(0)

  if (live && steps.length !== seenSteps) {
    setSeenSteps(steps.length)
    setLastStepAt(steps.length > 0 ? Date.now() : null)
  }

  useEffect(() => {
    if (!live) return undefined
    const id = setInterval(() => setNow(Date.now()), THINKING_PHRASE_INTERVAL_MS / 5)
    return () => clearInterval(id)
  }, [live])

  if (!live && !hasThought(reasoning, steps)) return null

  const text = reasoning?.trim() ?? ''
  const labels = steps.map((step) => step.label)
  const parts: string[] = [live ? tr('advisor.chat.thought.headingLive') : tr('advisor.chat.thought.heading')]
  const elapsed = live ? now - startedAt : durationMs
  if (elapsed !== undefined) parts.push(tr('advisor.chat.thought.seconds', { count: seconds(elapsed) }))
  if (!live && steps.length > 0) parts.push(tr('advisor.chat.thought.steps', { count: steps.length }))

  const current = live ? thinkingLabelAt({ steps: labels, lastStepAt, startedAt, now, phraseCount: THINKING_PHRASE_COUNT }) : null
  const currentText = current === null ? null : current.kind === 'step' ? current.text : tr(`advisor.chat.thinkingPhrases.${current.index}`)

  return (
    <View style={styles.box} testID="advisor-thought">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={expanded ? tr('advisor.chat.thought.hide') : tr('advisor.chat.thought.show')}
        aria-expanded={expanded}
        onPress={() => setExpanded((prev) => !prev)}
        style={(state) => [styles.header, (state as { hovered?: boolean }).hovered ? styles.headerHover : null]}
        testID="advisor-thought-toggle"
      >
        {live ? (
          <View style={styles.liveRow} testID="advisor-thinking">
            <ThinkingGlyph />
            <Text style={styles.heading}>{parts.join(' · ')}</Text>
            <Text style={styles.current} numberOfLines={1} aria-hidden testID="eule-thinking-phrase">
              {currentText}
            </Text>
          </View>
        ) : (
          <>
            <StrokeIcon name="bulb" size={16} color={t.color.tinte2} />
            <Text style={styles.heading}>{parts.join(' · ')}</Text>
          </>
        )}
        <StrokeIcon name={expanded ? 'chevronDown' : 'chevronRight'} size={14} color={t.color.tinte2} strokeWidth={2.5} />
      </Pressable>
      {live ? (
        <Text style={styles.srOnly} accessibilityLiveRegion="polite" aria-live="polite" testID="advisor-thinking-status">
          {labels[labels.length - 1] ?? tr('advisor.chat.thinking')}
        </Text>
      ) : null}
      {expanded ? (
        <View style={styles.body} testID="advisor-thought-body">
          {steps.map((step, index) => (
            <View key={`${index}-${step.label}`} style={styles.step} testID="advisor-thought-step">
              <StrokeIcon name={iconOf(step)} size={16} color={t.color.tinte2} />
              <Text style={styles.stepText}>
                {step.result !== undefined ? `${doneLabel(step.label)}: ` : step.label}
                {step.result !== undefined ? (
                  <Text style={step.ok === false ? styles.stepRefused : styles.stepResult} testID="advisor-thought-result">
                    {step.result}
                  </Text>
                ) : null}
              </Text>
            </View>
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
    box: { marginBottom: t.space.s2 } as ViewStyle,
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      maxWidth: '100%',
      gap: t.space.s2,
      minHeight: 36,
      paddingHorizontal: t.space.s2,
      marginLeft: -t.space.s2,
      borderRadius: t.radius.s,
    } as ViewStyle,
    headerHover: { backgroundColor: t.color.linieWeich } as ViewStyle,
    liveRow: { flexDirection: 'row', alignItems: 'center', gap: t.space.s2, flexShrink: 1 } as ViewStyle,
    heading: { fontFamily: t.font.text, fontSize: t.size.s, fontWeight: t.weight.halb, color: t.color.tinte2 } as TextStyle,
    current: { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte2, flexShrink: 1 } as TextStyle,
    body: {
      marginTop: t.space.s1,
      marginLeft: t.space.s1,
      paddingLeft: t.space.s4,
      borderLeftWidth: 2,
      borderLeftColor: t.color.linieWeich,
      gap: t.space.s1,
    } as ViewStyle,
    step: { flexDirection: 'row', alignItems: 'flex-start', gap: t.space.s2, paddingVertical: 4 } as ViewStyle,
    stepText: { flexShrink: 1, fontFamily: t.font.text, fontSize: t.size.s, lineHeight: 20, color: t.color.tinte2 } as TextStyle,
    stepResult: { color: t.color.tinte, fontWeight: t.weight.halb } as TextStyle,
    stepRefused: { color: t.color.tinte2, fontStyle: 'italic' } as TextStyle,
    reasoning: { fontFamily: t.font.text, fontSize: t.size.s, lineHeight: 21, color: t.color.tinte2, fontStyle: 'italic', marginTop: t.space.s2 } as TextStyle,
    note: { fontFamily: t.font.text, fontSize: t.size.xs, color: t.color.tinte2, marginTop: t.space.s1 } as TextStyle,
    srOnly: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 } as TextStyle,
  }
}
