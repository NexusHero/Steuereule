import { useRef, useState, type ReactNode } from 'react'
import { Animated, Easing, Pressable, Text, View, type LayoutChangeEvent, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import { theme as motionTokens } from '@steuereule/tokens'
import { useTheme } from '../theme/useTheme'
import { useReducedMotion } from '../motion/useReducedMotion'

export const TAB_ICON_PATHS = {
  cockpit: 'M4 13h6V4H4v9zm0 7h6v-5H4v5zm10 0h6V11h-6v9zm0-16v5h6V4h-6z',
  belege: 'M7 3h7l5 5v13H7V3zm7 0v5h5M9 12h8M9 16h8',
  berater: 'M4 5h16v11H8l-4 4V5z',
  jahr: 'M4 5h16v15H4V5zm0 5h16M8 3v4m8-4v4',
  uebertragen: 'M12 4v12m0-12l-5 5m5-5l5 5M4 20h16',
  profil: 'M12 11a4 4 0 100-8 4 4 0 000 8zm-7 9a7 7 0 0114 0',
} as const

export interface TabItem {
  readonly id: string
  readonly label: string
  readonly icon?: ReactNode
}

export interface TabBarProps {
  readonly tabs: readonly TabItem[]
  readonly aktiv: string
  readonly onWechsel: (id: string) => void
  readonly style?: StyleProp<ViewStyle>
  readonly testID?: string
}

interface TabLayout {
  readonly x: number
  readonly width: number
  readonly height: number
}

const PILL_DURATION_MS = 420

export function TabBar({ tabs, aktiv, onWechsel, style, testID }: TabBarProps) {
  const t = useTheme()
  const reducedMotion = useReducedMotion()
  const [layouts, setLayouts] = useState<Record<string, TabLayout>>({})

  const pillX = useRef(new Animated.Value(0)).current
  const pillWidth = useRef(new Animated.Value(0)).current
  const pillHeight = useRef(new Animated.Value(0)).current
  const settled = useRef(false)

  const activeLayout = layouts[aktiv]

  if (activeLayout) {
    const [x1, y1, x2, y2] = motionTokens.easing.feder
    const feder = Easing.bezier(x1, y1, x2, y2)
    const instant = reducedMotion || !settled.current
    settled.current = true

    const to = (value: Animated.Value, target: number) =>
      instant
        ? value.setValue(target)
        : Animated.timing(value, { toValue: target, duration: PILL_DURATION_MS, easing: feder, useNativeDriver: false }).start()

    to(pillX, activeLayout.x)
    to(pillWidth, activeLayout.width)
    to(pillHeight, activeLayout.height)
  }

  const styles = makeStyles(t)

  function rememberLayout(id: string, event: LayoutChangeEvent) {
    const { x, width, height } = event.nativeEvent.layout
    setLayouts((previous) => {
      const known = previous[id]
      if (known && known.x === x && known.width === width && known.height === height) return previous
      return { ...previous, [id]: { x, width, height } }
    })
  }

  return (
    <View style={[styles.bar, style]} testID={testID}>
      <View style={styles.inner}>
        {activeLayout ? (
          <Animated.View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.pill, { transform: [{ translateX: pillX }], width: pillWidth, height: pillHeight }]}
          />
        ) : null}

        {tabs.map((tab) => {
          const an = tab.id === aktiv
          return (
            <Pressable
              key={tab.id}
              onLayout={(event) => rememberLayout(tab.id, event)}
              onPress={() => onWechsel(tab.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: an }}
              aria-current={an ? 'page' : undefined}
              style={[styles.tab, an && !activeLayout ? styles.tabActiveFallback : null]}
            >
              {tab.icon}
              <Text style={[styles.label, an ? styles.labelActive : null]}>{tab.label}</Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

function makeStyles(t: ReturnType<typeof useTheme>) {
  const bar: ViewStyle = {
    position: 'absolute',
    bottom: t.space.s3,
    left: t.space.s3,
    right: t.space.s3,
    alignItems: 'center',
    zIndex: 10,
  }
  const inner: ViewStyle = {
    position: 'relative',
    flexDirection: 'row',
    width: '100%',
    maxWidth: 440,
    gap: 2,
    backgroundColor: t.color.karte,
    borderWidth: 2,
    borderColor: t.color.tinte,
    borderRadius: t.radius.pille,
    padding: 6,
    ...t.shadow.hart,
  }
  const pill: ViewStyle = {
    position: 'absolute',
    top: 6,
    left: 6,
    zIndex: 0,
    backgroundColor: t.color.funke,
    borderWidth: 1.5,
    borderColor: t.color.tinte,
    borderRadius: t.radius.pille,
  }
  const tab: ViewStyle = {
    position: 'relative',
    zIndex: 1,
    flex: 1,
    minHeight: 52,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: t.radius.pille,
  }
  const tabActiveFallback: ViewStyle = {
    backgroundColor: t.color.funke,
    borderWidth: 1.5,
    borderColor: t.color.tinte,
  }
  const label: TextStyle = {
    fontFamily: t.font.text,
    fontSize: 11,
    fontWeight: t.weight.fett,
    color: t.color.tinte2,
  }
  const labelActive: TextStyle = { color: t.color.tinte }

  return { bar, inner, pill, tab, tabActiveFallback, label, labelActive }
}
