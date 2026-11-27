import { Pressable, Text, View, type ViewStyle, type TextStyle, type StyleProp } from 'react-native'
import { type ReactNode } from 'react'
import { hapticLight } from '../lib/haptics'
import { minTouchHeight } from '../lib/touch-target'
import { inkOnFunke, useTheme } from '../theme/useTheme'

export interface OptionProps {
  readonly selected?: boolean
  readonly onPress?: () => void
  readonly style?: StyleProp<ViewStyle>
  readonly children: ReactNode
  /** A leading icon; decoration beside the label, which stays the option's name. */
  readonly icon?: ReactNode
  readonly testID?: string
}

const MIN_HEIGHT = 52

export function Option({ selected = false, onPress, style, children, icon, testID }: OptionProps) {
  const t = useTheme()
  const container: ViewStyle = {
    width: '100%',
    minHeight: MIN_HEIGHT,
    justifyContent: 'center',
    padding: t.space.s4,
    paddingRight: t.space.s6,
    marginBottom: t.space.s3,
    // Quiet rows: a thin tinte-2 contour at rest (≥ 3:1, WCAG 1.4.11). The chosen one is
    // unmistakable — full lime, ink contour and a check mark — never a soft tint alone (~1.1:1).
    backgroundColor: selected ? t.color.funke : t.color.karte,
    borderWidth: t.space.kontur,
    borderColor: selected ? t.color.tinte : t.color.tinte2,
    borderRadius: t.radius.s,
  }
  const label: TextStyle = {
    textAlign: 'left',
    fontFamily: t.font.text,
    fontWeight: t.weight.fett,
    fontSize: t.size.m,
    color: selected ? inkOnFunke(t) : t.color.tinte,
  }
  const row: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s3 }
  // The check sits at the row's end, so the label keeps its place when chosen.
  const mark: TextStyle = { position: 'absolute', right: t.space.s4 }
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      aria-pressed={selected}
      accessibilityState={{ selected }}
      onPress={() => {
        void hapticLight()
        onPress?.()
      }}
      style={({ pressed }) => [
        container,
        style,
        // State and touch-target styles follow the caller's `style` so they always win (#178).
        minTouchHeight(style, MIN_HEIGHT),
        pressed && !selected && { borderColor: t.color.tinte },
      ]}
    >
      {icon === undefined ? (
        typeof children === 'string' ? <Text style={label}>{children}</Text> : children
      ) : (
        <View style={row}>
          {icon}
          {typeof children === 'string' ? <Text style={[label, { flexShrink: 1 }]}>{children}</Text> : children}
        </View>
      )}
      {selected ? (
        <Text style={[label, mark]} accessibilityElementsHidden importantForAccessibility="no" aria-hidden>
          ✓
        </Text>
      ) : null}
    </Pressable>
  )
}
