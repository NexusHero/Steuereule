// Splash (F: splash.html) — the SteuerEule brand draws itself in on first paint, then auto-
// advances after ~2.4s; the whole screen is one tap target so anyone can skip straight through.
// `prefers-reduced-motion` is honored: the mark, wordmark and greeting simply appear at rest —
// no `Animated.timing` ever runs (design-system CLAUDE.md, "immer hinter prefers-reduced-motion").
//
// This screen decides nothing about *where* it leads — it only signals "done displaying" via
// `onAdvance`. There is no session-detection mechanism yet to tell a new visitor from a returning
// one (that's REQ-009, session storage, still pending), so today `onAdvance` always leads to the
// same next stage the caller (App.tsx) wires up. A personalised greeting for returning users
// (the DS reference reads a stashed name from `localStorage`) is intentionally not ported —
// ADR-0008 forbids client-side persistence of profile data, and without a live session there is
// nothing honest to greet someone by.
import { useEffect, useRef } from 'react'
import { Animated, Easing, Pressable, Text, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme, type UiTheme } from '@steuereule/ui'
// `duration`/`easing` are mode-invariant motion tokens that `UiTheme` (colour + scales for the
// active mode) doesn't carry — read straight from @steuereule/tokens rather than adding a
// cross-cutting field to the shared theme for one screen's animation.
import { theme as motionTokens } from '@steuereule/tokens'
import { APP_NS } from '../i18n/resources'
import { OwlMark } from '../marks/OwlMark'
import { useReducedMotion } from './splash/useReducedMotion'

export interface SplashScreenProps {
  readonly onAdvance: () => void
}

const AUTO_ADVANCE_MS = 2400

// DS reference (splash.html `au-blinzeln`): a single 0.4s ease-in-out blink, lids fully closed
// (scaleY 1) at 45% of the duration and back open (scaleY 0) by 100% — not symmetric, so it's
// two `Animated.timing` legs rather than one. This is the one ease-in-out beat in an otherwise
// `feder`-eased entrance, and it's local to the blink only — not worth a shared motion token for
// a single split used nowhere else.
const BLINK_DURATION_MS = 400
const BLINK_CLOSE_MS = Math.round(BLINK_DURATION_MS * 0.45)
const BLINK_OPEN_MS = BLINK_DURATION_MS - BLINK_CLOSE_MS

export function SplashScreen({ onAdvance }: SplashScreenProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const reducedMotion = useReducedMotion()
  const styles = makeStyles(t)

  // Every value starts at 1 (fully drawn) so the very first paint is always the static, at-rest
  // brand — reduced-motion users never see anything else. Only when we learn motion is allowed do
  // we rewind to 0 and play the entrance once.
  const headAnim = useRef(new Animated.Value(1)).current
  const glassesAnim = useRef(new Animated.Value(1)).current
  const wordAnim = useRef(new Animated.Value(1)).current
  const greetAnim = useRef(new Animated.Value(1)).current
  // The lid is the odd one out: it doesn't animate "undrawn -> drawn" like the other layers, it
  // animates "open -> shut -> open" (a blink). Its rest value is 0 (`scaleY(0)`, retracted, eyes
  // OPEN — the DS reference's at-rest state), which is already correct for the very first paint
  // and for reduced motion, so unlike the others there's nothing to reset before the entrance.
  const lidAnim = useRef(new Animated.Value(0)).current
  const hasPlayed = useRef(false)

  // A tap-to-skip and the auto-advance timer both want to call `onAdvance` — exactly once,
  // whichever happens first. `advance` guards against the second firing (e.g. the timer landing
  // just after a skip tap); it reads the latest `onAdvance` via a ref so the effect below never
  // needs to re-subscribe when the prop identity changes.
  const onAdvanceRef = useRef(onAdvance)
  onAdvanceRef.current = onAdvance
  const advancedRef = useRef(false)
  function advance() {
    if (advancedRef.current) return
    advancedRef.current = true
    onAdvanceRef.current()
  }

  useEffect(() => {
    if (reducedMotion || hasPlayed.current) return
    hasPlayed.current = true
    const [x1, y1, x2, y2] = motionTokens.easing.feder
    const feder = Easing.bezier(x1, y1, x2, y2)
    headAnim.setValue(0)
    glassesAnim.setValue(0)
    lidAnim.setValue(0)
    wordAnim.setValue(0)
    greetAnim.setValue(0)
    const stage = (value: Animated.Value) =>
      Animated.timing(value, { toValue: 1, duration: motionTokens.duration.auftritt, easing: feder, useNativeDriver: false })
    const blinkEasing = Easing.inOut(Easing.ease)
    // The blink plays once, right after the glasses draw in and before the wordmark — matching
    // the DS reference's ordering (head -> glasses -> blink -> wordmark -> greeting). Built inline
    // (rather than as a separately-named `const`) so its two legs are constructed, in source
    // order, between the glasses and wordmark stages below.
    Animated.sequence([
      stage(headAnim),
      stage(glassesAnim),
      Animated.sequence([
        Animated.timing(lidAnim, { toValue: 1, duration: BLINK_CLOSE_MS, easing: blinkEasing, useNativeDriver: false }),
        Animated.timing(lidAnim, { toValue: 0, duration: BLINK_OPEN_MS, easing: blinkEasing, useNativeDriver: false }),
      ]),
      stage(wordAnim),
      stage(greetAnim),
    ]).start()
  }, [reducedMotion, headAnim, glassesAnim, lidAnim, wordAnim, greetAnim])

  useEffect(() => {
    const id = setTimeout(advance, AUTO_ADVANCE_MS)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `advance` reads onAdvance via a ref
    // by design, precisely so this timer is set up once and never reset by prop identity churn.
  }, [])

  const headStyle = {
    opacity: headAnim,
    transform: [{ scale: headAnim.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) }],
  }
  const glassesStyle = {
    opacity: glassesAnim,
    transform: [{ translateY: glassesAnim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }],
  }
  // `transformOrigin: 'center top'` (RN 0.74+ / react-native-web 0.20, both in use here) makes the
  // lid hinge from its top edge as it scales, like a real eyelid closing downward over the pupil —
  // the DS reference's `.au-lid { transform-origin: center top }`. Scaling from the element centre
  // (RN's default) would close the lid from the middle out, which reads wrong.
  const lidStyle = {
    transform: [{ scaleY: lidAnim }],
    transformOrigin: 'center top' as const,
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tr('splash.skipLabel')}
      onPress={advance}
      style={styles.screen}
    >
      <OwlMark headStyle={headStyle} glassesStyle={glassesStyle} lidStyle={lidStyle} />
      <Animated.View style={{ opacity: wordAnim }}>
        <Text style={styles.wordmark}>
          {tr('brand.steuer')}
          <Text style={{ color: t.color.funke }}>{tr('brand.eule')}</Text>
        </Text>
      </Animated.View>
      <Animated.View style={{ opacity: greetAnim }}>
        <Text style={styles.greeting}>{tr('splash.greeting')}</Text>
      </Animated.View>
    </Pressable>
  )
}

function makeStyles(t: UiTheme) {
  const screen: ViewStyle = {
    flex: 1,
    minHeight: '100%',
    width: '100%',
    backgroundColor: t.color.nacht,
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.space.s3,
  }
  const wordmark: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size.xl,
    color: t.color.nachtText,
  }
  const greeting: TextStyle = {
    fontFamily: t.font.text,
    fontSize: t.size.m,
    color: t.color.nachtText,
    opacity: 0.9,
  }

  return { screen, wordmark, greeting }
}
