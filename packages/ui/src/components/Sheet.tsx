import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Animated, KeyboardAvoidingView, PanResponder, Platform, Pressable, StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { theme as motionTokens } from '@steuereule/tokens'
import { useTheme } from '../theme/useTheme'
import { useBreakpoint } from '../responsive/useBreakpoint'
import { WIDE_CONTENT_MAX_WIDTH } from '../responsive/contentWidth'
import { useReducedMotion } from '../motion/useReducedMotion'
import { UI_NS } from '../i18n/resources'

const DISMISS_DRAG_DISTANCE_PX = 120
const COMPACT_ENTRY_OFFSET_PX = 40

export function sheetKeyboardBehavior(os: string): 'padding' | undefined {
  return os === 'ios' ? 'padding' : undefined
}

export interface SheetProps {
  readonly onClose: () => void
  readonly closeLabel?: string
  readonly children: ReactNode
  readonly testID?: string
}

export function Sheet({ onClose, closeLabel, children, testID }: SheetProps) {
  const t = useTheme()
  const bp = useBreakpoint()
  const compact = bp === 's'
  const reducedMotion = useReducedMotion()
  const { t: tr } = useTranslation(UI_NS)
  const resolvedCloseLabel = closeLabel ?? tr('sheet.schliessen')

  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const panelRef = useRef<View | null>(null)
  const translateY = useRef(new Animated.Value(compact && !reducedMotion ? COMPACT_ENTRY_OFFSET_PX : 0)).current

  useEffect(() => {
    const focusable = panelRef.current as unknown as { focus?: () => void } | null
    focusable?.focus?.()
  }, [])

  useEffect(() => {
    if (!compact || reducedMotion) {
      translateY.setValue(0)
      return
    }
    const anim = Animated.timing(translateY, {
      toValue: 0,
      duration: motionTokens.duration.schnell,
      useNativeDriver: false,
    })
    anim.start()
    return () => anim.stop()
  }, [compact, reducedMotion, translateY])

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onCloseRef.current()
      }
    }
    // Capture phase ensures Escape still closes the Sheet when a focused react-native-web TextInput calls stopPropagation().
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [])

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_event, gestureState) => Math.abs(gestureState.dy) > 2,
        onPanResponderMove: (_event, gestureState) => {
          if (gestureState.dy > 0) {
            translateY.setValue(gestureState.dy)
          }
        },
        onPanResponderRelease: (_event, gestureState) => {
          if (gestureState.dy > DISMISS_DRAG_DISTANCE_PX) {
            onCloseRef.current()
            return
          }
          if (reducedMotion) {
            translateY.setValue(0)
            return
          }
          Animated.timing(translateY, {
            toValue: 0,
            duration: motionTokens.duration.schnell,
            useNativeDriver: false,
          }).start()
        },
        onPanResponderTerminate: () => {
          translateY.setValue(0)
        },
      }),
    [reducedMotion, translateY],
  )

  const overlayStyle: ViewStyle = {
    ...StyleSheet.absoluteFillObject,
    flex: 1,
    zIndex: 100,
    justifyContent: compact ? 'flex-end' : 'center',
    alignItems: 'center',
    paddingHorizontal: compact ? 0 : t.space.s5,
    paddingVertical: compact ? 0 : t.space.s5,
  }

  const backdropStyle: ViewStyle = {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: t.color.nacht,
    opacity: 0.5,
  }

  const panelShapeStyle: ViewStyle = compact
    ? {
        width: '100%',
        maxHeight: '92%',
        borderTopLeftRadius: t.radius.lg,
        borderTopRightRadius: t.radius.lg,
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
      }
    : {
        width: '100%',
        maxWidth: WIDE_CONTENT_MAX_WIDTH,
        maxHeight: '88%',
        borderRadius: t.radius.m,
      }

  const panelStyle: ViewStyle = {
    backgroundColor: t.color.grund,
    borderWidth: t.space.kontur,
    borderColor: t.color.tinte,
    ...t.shadow.hart,
    flexShrink: 1,
    overflow: 'hidden',
  }

  const grabberAreaStyle: ViewStyle = {
    width: '100%',
    alignItems: 'center',
    paddingTop: t.space.s3,
    paddingBottom: t.space.s2,
  }

  const grabberBarStyle: ViewStyle = {
    width: 44,
    height: 4,
    borderRadius: t.radius.pille,
    backgroundColor: t.color.linieWeich,
  }

  const headerStyle: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: t.space.s4,
    paddingTop: compact ? t.space.s1 : t.space.s3,
    paddingBottom: t.space.s2,
  }

  const closeButtonStyle: ViewStyle = {
    minHeight: 36,
    paddingHorizontal: t.space.s3,
    paddingVertical: t.space.s1,
    borderRadius: t.radius.pille,
    borderWidth: t.space.kontur,
    borderColor: t.color.tinte,
    backgroundColor: t.color.karte,
    justifyContent: 'center',
    alignItems: 'center',
    ...t.shadow.hartS,
  }

  const closeButtonPressedStyle: ViewStyle = {
    transform: [{ translateX: 2 }, { translateY: 2 }],
    shadowOpacity: 0,
    elevation: 0,
  }

  const closeLabelStyle: TextStyle = {
    fontFamily: t.font.text,
    fontWeight: t.weight.fett,
    fontSize: t.size.s,
    color: t.color.tinte,
  }

  const bodyStyle: ViewStyle = {
    flexShrink: 1,
    minHeight: 0,
    width: '100%',
  }

  return (
    <KeyboardAvoidingView testID={testID} style={overlayStyle} behavior={sheetKeyboardBehavior(Platform.OS)}>
      <Pressable testID="sheet-backdrop" accessible={false} onPress={onClose} style={backdropStyle} />
      <Animated.View
        ref={panelRef}
        role="dialog"
        aria-modal={true}
        accessibilityViewIsModal
        {...(Platform.OS === 'web' ? ({ tabIndex: -1 } as Record<string, unknown>) : {})}
        style={[panelStyle, panelShapeStyle, { transform: [{ translateY }] }]}
      >
        {compact ? (
          <View testID="sheet-grabber" {...panResponder.panHandlers} style={grabberAreaStyle}>
            <View style={grabberBarStyle} />
          </View>
        ) : null}
        <View style={headerStyle}>
          <Pressable
            testID="sheet-schliessen"
            accessibilityRole="button"
            accessibilityLabel={resolvedCloseLabel}
            onPress={onClose}
            style={({ pressed }) => [closeButtonStyle, pressed && closeButtonPressedStyle]}
          >
            <Text style={closeLabelStyle}>{resolvedCloseLabel}</Text>
          </Pressable>
        </View>
        <View style={bodyStyle}>{children}</View>
      </Animated.View>
    </KeyboardAvoidingView>
  )
}
