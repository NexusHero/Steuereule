import { Pressable, Text, type ViewStyle, type TextStyle, type StyleProp } from 'react-native'
import { type ReactNode } from 'react'
import { inkOnFunke, useTheme } from '../theme/useTheme'

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
  const bg = active
    ? t.color.funke
    : variant === 'src'
      ? t.color.funkeWeich
      : variant === 'pro'
        ? t.color.nacht
        : t.color.karte
  const fg = active ? inkOnFunke(t) : variant === 'pro' ? t.color.funke : t.color.tinte

  const container: ViewStyle = {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingVertical: 4,
    paddingHorizontal: 14,
    backgroundColor: bg,
    borderWidth: 2,
    borderColor: t.color.tinte,
    borderRadius: t.radius.pille,
    ...t.shadow.hartS,
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
        pressed && { transform: [{ translateX: 2 }, { translateY: 2 }], shadowOpacity: 0, elevation: 0 },
        style,
      ]}
    >
      {typeof children === 'string' ? <Text style={label}>{children}</Text> : children}
    </Pressable>
  )
}
