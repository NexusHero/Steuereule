import { Pressable, Text, type ViewStyle, type TextStyle, type StyleProp } from 'react-native'
import { type ReactNode } from 'react'
import { useTheme } from '../theme/useTheme'

export type ButtonVariant = 'primaer' | 'ghost' | 'leise' | 'nacht'

export interface ButtonProps {
  readonly variant?: ButtonVariant
  readonly disabled?: boolean
  readonly onPress?: () => void
  readonly style?: StyleProp<ViewStyle>
  readonly children: ReactNode
  readonly testID?: string
}

export function Button({ variant = 'primaer', disabled = false, onPress, style, children, testID }: ButtonProps) {
  const t = useTheme()

  const bg: Record<ButtonVariant, string> = {
    primaer: t.color.funke,
    ghost: t.color.karte,
    leise: t.color.funkeWeich,
    nacht: t.color.nacht,
  }
  const fg = variant === 'nacht' ? t.color.funke : t.color.tinte
  const shadow = variant === 'leise' ? t.shadow.hartS : t.shadow.hart

  const container: ViewStyle = {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: t.space.s5,
    backgroundColor: bg[variant],
    borderWidth: 2,
    borderColor: t.color.tinte,
    borderRadius: t.radius.pille,
    ...shadow,
  }
  const label: TextStyle = {
    color: fg,
    fontFamily: t.font.text,
    fontWeight: t.weight.schwer,
    fontSize: t.size.m,
  }

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        container,
        disabled && { opacity: 0.4 },
        pressed && !disabled && { transform: [{ translateX: 4 }, { translateY: 4 }], shadowOpacity: 0, elevation: 0 },
        style,
      ]}
    >
      {typeof children === 'string' ? <Text style={label}>{children}</Text> : children}
    </Pressable>
  )
}
