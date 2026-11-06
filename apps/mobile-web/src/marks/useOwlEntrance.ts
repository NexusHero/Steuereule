import { useEffect, useRef } from 'react'
import { Animated, Easing } from 'react-native'
import { useReducedMotion } from '@steuereule/ui'
import { theme as motionTokens } from '@steuereule/tokens'

const BLINK_DURATION_MS = 400
const BLINK_CLOSE_MS = Math.round(BLINK_DURATION_MS * 0.45)
const BLINK_OPEN_MS = BLINK_DURATION_MS - BLINK_CLOSE_MS

/**
 * The brand-animation spec (guidelines/marke-animation.html) for an OwlMark outside the splash:
 * head pops on --feder, glasses land from above, one blink — played once per mount.
 * prefers-reduced-motion → the static mark (values rest at 1 / lids open).
 */
export function useOwlEntrance() {
  const reducedMotion = useReducedMotion()
  const headAnim = useRef(new Animated.Value(1)).current
  const glassesAnim = useRef(new Animated.Value(1)).current
  const lidAnim = useRef(new Animated.Value(0)).current
  const hasPlayed = useRef(false)

  useEffect(() => {
    if (reducedMotion || hasPlayed.current) return
    hasPlayed.current = true
    const [x1, y1, x2, y2] = motionTokens.easing.feder
    const feder = Easing.bezier(x1, y1, x2, y2)
    headAnim.setValue(0)
    glassesAnim.setValue(0)
    const stage = (value: Animated.Value) =>
      Animated.timing(value, { toValue: 1, duration: motionTokens.duration.auftritt, easing: feder, useNativeDriver: false })
    const blinkEasing = Easing.inOut(Easing.ease)
    Animated.sequence([
      stage(headAnim),
      stage(glassesAnim),
      Animated.timing(lidAnim, { toValue: 1, duration: BLINK_CLOSE_MS, easing: blinkEasing, useNativeDriver: false }),
      Animated.timing(lidAnim, { toValue: 0, duration: BLINK_OPEN_MS, easing: blinkEasing, useNativeDriver: false }),
    ]).start()
  }, [reducedMotion, headAnim, glassesAnim, lidAnim])

  return {
    headStyle: {
      opacity: headAnim,
      transform: [{ scale: headAnim.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) }],
    },
    glassesStyle: {
      opacity: glassesAnim,
      transform: [{ translateY: glassesAnim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }],
    },
    lidStyle: { transform: [{ scaleY: lidAnim }], transformOrigin: 'center top' as const },
  }
}
