import { Pressable, Text, type ViewStyle, type TextStyle, type StyleProp } from 'react-native'
import { type ReactNode } from 'react'
import { hapticLight } from '../lib/haptics'
import { useTheme } from '../theme/useTheme'

export interface OptionProps {
  readonly selected?: boolean
  readonly onPress?: () => void
  readonly style?: StyleProp<ViewStyle>
  readonly children: ReactNode
  readonly testID?: string
}

export function Option({ selected = false, onPress, style, children, testID }: OptionProps) {
  const t = useTheme()
  const container: ViewStyle = {
    width: '100%',
    minHeight: 52,
    justifyContent: 'center',
    padding: t.space.s4,
    marginBottom: t.space.s3,
    // Quiet rows: a thin tinte-2 contour at rest (≥ 3:1, WCAG 1.4.11); the chosen one gets soft
    // lime and an ink contour.
    backgroundColor: selected ? t.color.funkeWeich : t.color.karte,
    borderWidth: t.space.kontur,
    borderColor: selected ? t.color.tinte : t.color.tinte2,
    borderRadius: t.radius.s,
  }
  const label: TextStyle = {
    textAlign: 'left',
    fontFamily: t.font.text,
    fontWeight: t.weight.fett,
    fontSize: t.size.m,
    color: t.color.tinte,
  }
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      aria-pressed={selected}
      onPress={() => {
        void hapticLight()
        onPress?.()
      }}
      style={({ pressed }) => [
        container,
        pressed && !selected && { borderColor: t.color.tinte },
        style,
      ]}
    >
      {typeof children === 'string' ? <Text style={label}>{children}</Text> : children}
    </Pressable>
  )
}
