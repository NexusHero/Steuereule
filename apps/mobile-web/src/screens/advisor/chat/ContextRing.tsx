import { useState } from 'react'
import { Pressable, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { Circle, Svg } from 'react-native-svg'
import { useTranslation } from 'react-i18next'
import { Button, useTheme, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../../../i18n/resources'

export interface ContextRingState {
  /** 0 to 100. */
  readonly percent: number
  readonly level: 'ok' | 'warn' | 'full'
  /** False while the conversation is too short to summarise. */
  readonly canSummarize: boolean
}

export interface ContextRingProps {
  readonly context: ContextRingState
  /** Summarises the older part now; rejects when it could not. Without it the ring only shows. */
  readonly onSummarize?: (() => Promise<void>) | undefined
  /** No summary while an answer is being written. */
  readonly busy?: boolean | undefined
}

const SIZE = 24
const STROKE = 3
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/**
 * How full the context of the conversation is (#481): a small ring in the composer. It turns
 * amber before the older part gets summarised; tapping it says what the ring means and lets the
 * user summarise right away.
 */
export function ContextRing({ context, onSummarize, busy = false }: ContextRingProps) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<'idle' | 'working' | 'failed'>('idle')
  const percent = Math.max(0, Math.min(100, Math.round(context.percent)))
  const color = context.level === 'ok' ? t.color.tinte2 : context.level === 'warn' ? t.color.warn : t.color.fehler

  async function summarize() {
    if (!onSummarize) return
    setState('working')
    try {
      await onSummarize()
      setState('idle')
      setOpen(false)
    } catch {
      setState('failed')
    }
  }

  return (
    <View style={styles.anchor}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr('advisor.chat.context.aria', { percent })}
        aria-expanded={open}
        onPress={() => setOpen((prev) => !prev)}
        style={styles.button}
        testID="advisor-context-ring"
      >
        <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
          <Circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} stroke={t.color.linie} strokeWidth={STROKE} fill="none" />
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke={color}
            strokeWidth={STROKE}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${(percent / 100) * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        </Svg>
      </Pressable>

      {open ? (
        <View style={styles.popover} testID="advisor-context-popover">
          <Text style={styles.title} testID="advisor-context-percent">
            {tr('advisor.chat.context.title', { percent })}
          </Text>
          <Text style={styles.body}>{tr(context.level === 'ok' ? 'advisor.chat.context.bodyOk' : 'advisor.chat.context.bodySoon')}</Text>
          {onSummarize ? (
            <Button
              variant="leise"
              disabled={!context.canSummarize || busy || state === 'working'}
              onPress={() => void summarize()}
              testID="advisor-context-summarize"
            >
              {tr(state === 'working' ? 'advisor.chat.context.working' : 'advisor.chat.context.summarize')}
            </Button>
          ) : null}
          {!context.canSummarize ? <Text style={styles.body}>{tr('advisor.chat.context.tooShort')}</Text> : null}
          {state === 'failed' ? (
            <Text style={styles.failed} role="alert" testID="advisor-context-failed">
              {tr('advisor.chat.context.failed')}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

export interface SummaryDividerProps {
  readonly summary?: string | undefined
}

/** Marks where the summarised part of a conversation ends; the messages above stay readable. */
export function SummaryDivider({ summary }: SummaryDividerProps) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const [open, setOpen] = useState(false)
  return (
    <View style={styles.divider} testID="advisor-summary-divider">
      <View style={styles.dividerLine}>
        <View style={styles.rule} />
        <Pressable
          accessibilityRole="button"
          aria-expanded={open}
          disabled={!summary}
          onPress={() => setOpen((prev) => !prev)}
          style={styles.dividerButton}
          testID="advisor-summary-toggle"
        >
          <Text style={styles.dividerText}>
            {tr('advisor.chat.context.divider')}
            {summary ? (open ? ' ▾' : ' ▸') : ''}
          </Text>
        </Pressable>
        <View style={styles.rule} />
      </View>
      {open && summary ? (
        <View style={styles.summaryBox} testID="advisor-summary-text">
          <Text style={styles.body}>{tr('advisor.chat.context.dividerHelp')}</Text>
          <Text style={styles.summaryText}>{summary}</Text>
        </View>
      ) : null}
    </View>
  )
}

function makeStyles(t: UiTheme) {
  return {
    anchor: { position: 'relative' } as ViewStyle,
    button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' } as ViewStyle,
    popover: {
      position: 'absolute',
      bottom: 48,
      right: 0,
      width: 260,
      padding: t.space.s3,
      gap: t.space.s2,
      borderRadius: t.radius.m,
      borderWidth: 1,
      borderColor: t.color.linie,
      backgroundColor: t.color.karte,
      zIndex: 10,
    } as ViewStyle,
    title: { fontFamily: t.font.text, fontWeight: t.weight.fett, fontSize: t.size.s, color: t.color.tinte } as TextStyle,
    body: { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte2 } as TextStyle,
    failed: { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.fehler } as TextStyle,
    divider: { gap: t.space.s2, marginVertical: t.space.s2 } as ViewStyle,
    dividerLine: { flexDirection: 'row', alignItems: 'center', gap: t.space.s2 } as ViewStyle,
    rule: { flex: 1, height: 1, backgroundColor: t.color.linie } as ViewStyle,
    dividerButton: { minHeight: 44, justifyContent: 'center' } as ViewStyle,
    dividerText: { fontFamily: t.font.text, fontSize: t.size.xs, color: t.color.tinte2 } as TextStyle,
    summaryBox: { padding: t.space.s3, gap: t.space.s2, borderRadius: t.radius.m, backgroundColor: t.color.grund } as ViewStyle,
    summaryText: { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte } as TextStyle,
  }
}
