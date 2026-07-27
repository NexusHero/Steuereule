// Schwebende Pillen-Tab-Bar (fk-tabbar) — the app's main navigation. A lime pill glides
// behind the active tab with the Feder overshoot, exactly as the DS reference does
// (components/navigation/TabBar.jsx + .fk-tabbar in komponenten.css).
//
// The pill is measured rather than computed: each tab reports its own layout, so the pill
// lands on the real rendered geometry instead of an assumption about equal widths. Until a
// tab has reported, the pill is not rendered at all and the active tab colours itself —
// the same JS-less fallback the DS keeps for its static cards, so the bar is never blank.
//
// Deliberate deviation from the reference: the DS turns the bar into a left rail above
// 1000px. That breakpoint has no counterpart in our token scale (s 375 / m 768 / l 1280),
// and inventing one would put a number in the code that the design system never chose, so
// the rail is not ported here. Tracked separately.
import { useRef, useState, type ReactNode } from 'react'
import { Animated, Easing, Pressable, Text, View, type LayoutChangeEvent, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import { theme as motionTokens } from '@steuereule/tokens'
import { useTheme } from '../theme/useTheme'
import { useReducedMotion } from '../motion/useReducedMotion'

/**
 * The stroke paths behind the DS tab icons, kept here so the design system stays the
 * source of truth for them. They are handed out as data rather than rendered here because
 * this package draws no SVG — the consuming app owns the SVG runtime and renders them into
 * the `icon` slot below.
 */
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
  /** Rendered above the label. Draw it from `TAB_ICON_PATHS` with your own SVG runtime. */
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

  // One value per geometry axis rather than a transform on a fixed-size box: the tabs are
  // flex-sized, so the pill has to change width as well as position when it moves.
  const pillX = useRef(new Animated.Value(0)).current
  const pillWidth = useRef(new Animated.Value(0)).current
  const pillHeight = useRef(new Animated.Value(0)).current
  const settled = useRef(false)

  const activeLayout = layouts[aktiv]

  if (activeLayout) {
    const [x1, y1, x2, y2] = motionTokens.easing.feder
    const feder = Easing.bezier(x1, y1, x2, y2)
    // The first placement jumps: there is nothing to glide from, and animating in from 0
    // would read as the bar assembling itself on every mount.
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
            // Presentational only — the active tab already carries `aria-current`, so a
            // screen reader gains nothing from the pill and would only hear noise.
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
              // Without a measured pill the active tab has to show its own state, or the
              // bar would give no feedback at all on the very first paint.
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
