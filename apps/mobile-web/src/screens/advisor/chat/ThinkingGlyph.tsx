import { useEffect, useRef } from 'react'
import { Animated, Easing, View, type ViewStyle } from 'react-native'
import { OwlGlyph, useReducedMotion, useTheme, type UiTheme } from '@steuereule/ui'

/**
 * The owl at work (#451 decision 5): turning its head, or, with reduced motion, three pulsing
 * dots. Shown at the head of the live line of thought.
 */
export function ThinkingGlyph() {
  const t = useTheme()
  const styles = makeStyles(t)
  const reducedMotion = useReducedMotion()
  return reducedMotion ? <PulsingDots styles={styles} /> : <TurningOwl ink={t.color.ki} ground={t.color.kiWeich} />
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
    dots: { flexDirection: 'row', gap: 4, width: 22, justifyContent: 'center' } as ViewStyle,
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: t.color.ki } as ViewStyle,
  }
}
