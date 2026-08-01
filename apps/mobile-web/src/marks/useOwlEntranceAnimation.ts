// The SteuerEule owl mark's self-draw entrance (DS reference: splash.html `au-blinzeln` +
// `fx-*` timings) — head, then glasses, then a blink, each layer driven by its own
// `Animated.Value` (see OwlMark.tsx's header comment for why `Animated.View`, not `View`, is
// load-bearing here). Same tokens (`--feder`, `duration.auftritt`), same easing, same blink
// timing as SplashScreen's own entrance (#238's Login QR column reuses it, not a new motion
// pattern) — but a genuinely separate hook, not an extraction SplashScreen was rewired onto.
// SplashScreen's own sequence interleaves the wordmark and greeting *between* the glasses stage
// and the blink (its own test asserts the blink is the last beat, after both), which this hook
// has no wordmark/greeting step to interleave with; forcing that composition through one shared
// sequence risked exactly the ordering SplashScreen.test.tsx exists to pin down, for a screen
// with its own tuned, already-shipped, already-tested animation. What's shared is the owl's own
// motion language (this file), not the runtime sequence.
//
// Plays once per mount, exactly like Splash: every value starts at 1 (fully drawn, at rest) so
// the very first paint is always the static brand mark, and reduced-motion users never see
// anything else. Only when motion is allowed do the values rewind to 0 and the entrance plays.
import { useEffect, useRef } from 'react'
import { Animated, Easing } from 'react-native'
import { useReducedMotion } from '@steuereule/ui'
import { theme as motionTokens } from '@steuereule/tokens'

// DS reference (splash.html `au-blinzeln`): a single 0.4s ease-in-out blink, lids fully closed
// (scaleY 1) at 45% of the duration and back open (scaleY 0) by 100% — not symmetric, so it's
// two `Animated.timing` legs rather than one.
const BLINK_DURATION_MS = 400
const BLINK_CLOSE_MS = Math.round(BLINK_DURATION_MS * 0.45)
const BLINK_OPEN_MS = BLINK_DURATION_MS - BLINK_CLOSE_MS

export function useOwlEntranceAnimation() {
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
    // `transformOrigin: 'center top'` (RN 0.74+ / react-native-web 0.20) makes the lid hinge
    // from its top edge as it scales, like a real eyelid closing downward — the DS reference's
    // `.au-lid { transform-origin: center top }`.
    lidStyle: {
      transform: [{ scaleY: lidAnim }],
      transformOrigin: 'center top' as const,
    },
  }
}
