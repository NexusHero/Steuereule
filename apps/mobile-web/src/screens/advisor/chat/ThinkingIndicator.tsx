import { useEffect, useRef, useState } from 'react'
import { Animated, Easing, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { OwlGlyph, useReducedMotion, useTheme, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../../../i18n/resources'
import { THINKING_PHRASE_COUNT, THINKING_PHRASE_INTERVAL_MS, thinkingLabelAt } from './thinkingLabel'

export interface ThinkingIndicatorProps {
  /** Real progress steps from the server (`status`/`tool` events), newest last. */
  readonly steps: readonly string[]
}

/**
 * What the owl shows while it works (#451 decisions 4 and 5): server steps first, friendly phrases
 * in between, the owl turning its head. With reduced motion only three pulsing dots remain. The
 * screen reader hears the status once through a polite live region, never every phrase.
 */
export function ThinkingIndicator({ steps }: ThinkingIndicatorProps) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const reducedMotion = useReducedMotion()
  const [startedAt] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())
  const lastStepAt = useRef<number | null>(null)
  const lastStepCount = useRef(0)

  if (steps.length !== lastStepCount.current) {
    lastStepCount.current = steps.length
    lastStepAt.current = steps.length > 0 ? Date.now() : null
  }

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), THINKING_PHRASE_INTERVAL_MS / 5)
    return () => clearInterval(id)
  }, [])

  const label = thinkingLabelAt({ steps, lastStepAt: lastStepAt.current, startedAt, now, phraseCount: THINKING_PHRASE_COUNT })
  const visible = label.kind === 'step' ? label.text : tr(`advisor.chat.thinkingPhrases.${label.index}`)
  const announced = steps[steps.length - 1] ?? tr('advisor.chat.thinking')

  return (
    <View style={styles.box} testID="advisor-thinking">
      <View style={styles.row}>
        {reducedMotion ? <PulsingDots styles={styles} /> : <TurningOwl ink={t.color.ki} ground={t.color.kiWeich} />}
        <Text style={styles.phrase} aria-hidden testID="eule-thinking-phrase">
          {visible}
        </Text>
      </View>
      <Text style={styles.srOnly} accessibilityLiveRegion="polite" aria-live="polite" testID="advisor-thinking-status">
        {announced}
      </Text>
    </View>
  )
}

function TurningOwl({ ink, ground }: { readonly ink: string; readonly ground: string }) {
  const turn = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(turn, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
        Animated.timing(turn, { toValue: -1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
        Animated.timing(turn, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [turn])
  const rotate = turn.interpolate({ inputRange: [-1, 1], outputRange: ['-18deg', '18deg'] })
  return (
    <Animated.View style={{ transform: [{ rotate }] }} testID="eule-thinking-owl">
      <OwlGlyph size={22} ink={ink} ground={ground} />
    </Animated.View>
  )
}

function PulsingDots({ styles }: { readonly styles: ReturnType<typeof makeStyles> }) {
  const pulse = useRef(new Animated.Value(0.3)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0.3, duration: 600, useNativeDriver: false }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [pulse])
  return (
    <View style={styles.dots} testID="eule-thinking-dots">
      {[0, 1, 2].map((i) => (
        <Animated.View key={i} style={[styles.dot, { opacity: pulse }]} />
      ))}
    </View>
  )
}

function makeStyles(t: UiTheme) {
  return {
    box: {
      padding: t.space.s3,
      borderRadius: t.radius.m,
      backgroundColor: t.color.kiWeich,
      marginBottom: t.space.s3,
    } as ViewStyle,
    row: { flexDirection: 'row', alignItems: 'center', gap: t.space.s2 } as ViewStyle,
    phrase: { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.ki, flexShrink: 1 } as TextStyle,
    dots: { flexDirection: 'row', gap: 4, width: 22, justifyContent: 'center' } as ViewStyle,
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: t.color.ki } as ViewStyle,
    srOnly: {
      position: 'absolute',
      width: 1,
      height: 1,
      overflow: 'hidden',
      opacity: 0,
    } as TextStyle,
  }
}
