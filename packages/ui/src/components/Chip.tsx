import { Pressable, Text, type ViewStyle, type TextStyle, type StyleProp } from 'react-native'
import { type ReactNode } from 'react'
import { useTheme } from '../theme/useTheme'

export type ChipVariant = 'standard' | 'src' | 'pro'

export interface ChipProps {
  readonly variant?: ChipVariant
  readonly active?: boolean
  readonly onPress?: () => void
  readonly style?: StyleProp<ViewStyle>
  readonly children: ReactNode
  readonly testID?: string
}

export function Chip({ variant = 'standard', active = false, onPress, style, children, testID }: ChipProps) {
  const t = useTheme()
  // Lime as light, not as a fill: an active chip is soft lime with an ink contour.
  const bg = active
    ? t.color.funkeWeich
    : variant === 'src'
      ? t.color.funkeWeich
      : variant === 'pro'
        ? t.color.nacht
        : t.color.karte
  const fg = variant === 'pro' && !active ? t.color.funke : t.color.tinte

  const container: ViewStyle = {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingVertical: 4,
    paddingHorizontal: 14,
    backgroundColor: bg,
    borderWidth: t.space.kontur,
    borderColor: active ? t.color.tinte : variant === 'pro' ? t.color.nacht : t.color.tinte2,
    borderRadius: t.radius.pille,
  }
  const label: TextStyle = { fontSize: t.size.s, fontWeight: t.weight.fett, color: fg }

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        container,
        pressed && { opacity: 0.7 },
        style,
      ]}
    >
      {typeof children === 'string' ? <Text style={label}>{children}</Text> : children}
    </Pressable>
  )
}
