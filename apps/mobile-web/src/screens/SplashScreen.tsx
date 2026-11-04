import { useEffect, useRef } from 'react'
import { Animated, Easing, Pressable, Text, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme, type UiTheme } from '@steuereule/ui'
import { theme as motionTokens } from '@steuereule/tokens'
import { APP_NS } from '../i18n/resources'
import { OwlMark } from '../marks/OwlMark'
import { useReducedMotion } from '@steuereule/ui'

export interface SplashScreenProps {
  readonly onAdvance: () => void
}

const AUTO_ADVANCE_MS = 2400

const BLINK_DURATION_MS = 400
const BLINK_CLOSE_MS = Math.round(BLINK_DURATION_MS * 0.45)
const BLINK_OPEN_MS = BLINK_DURATION_MS - BLINK_CLOSE_MS

export function SplashScreen({ onAdvance }: SplashScreenProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const reducedMotion = useReducedMotion()
  const styles = makeStyles(t)

  const headAnim = useRef(new Animated.Value(1)).current
  const glassesAnim = useRef(new Animated.Value(1)).current
  const wordAnim = useRef(new Animated.Value(1)).current
  const greetAnim = useRef(new Animated.Value(1)).current
  const lidAnim = useRef(new Animated.Value(0)).current
  const hasPlayed = useRef(false)

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
    Animated.sequence([
      stage(headAnim),
      stage(glassesAnim),
      stage(wordAnim),
      stage(greetAnim),
      Animated.timing(lidAnim, { toValue: 1, duration: BLINK_CLOSE_MS, easing: blinkEasing, useNativeDriver: false }),
      Animated.timing(lidAnim, { toValue: 0, duration: BLINK_OPEN_MS, easing: blinkEasing, useNativeDriver: false }),
    ]).start()
  }, [reducedMotion, headAnim, glassesAnim, lidAnim, wordAnim, greetAnim])

  useEffect(() => {
    const id = setTimeout(advance, AUTO_ADVANCE_MS)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const headStyle = {
    opacity: headAnim,
    transform: [{ scale: headAnim.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) }],
  }
  const glassesStyle = {
    opacity: glassesAnim,
    transform: [{ translateY: glassesAnim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }],
  }
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
