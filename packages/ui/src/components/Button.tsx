import { Pressable, Text, type ViewStyle, type TextStyle, type StyleProp } from 'react-native'
import { type ReactNode } from 'react'
import { hapticMedium } from '../lib/haptics'
import { inkOnFunke, useTheme } from '../theme/useTheme'

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
  const fg = variant === 'nacht' ? t.color.funke : variant === 'primaer' ? inkOnFunke(t) : t.color.tinte
  // "Funke ruhig": the hard offset shadow is the primary action's mark alone — one accent per
  // screen. Secondary variants sit flat, with a quiet contour (ghost) or none at all.
  const primary = variant === 'primaer'
  const border: Record<ButtonVariant, string> = {
    primaer: t.color.tinte,
    // tinte-2 keeps the control boundary at ≥ 3:1 (WCAG 1.4.11) while reading far quieter than ink.
    ghost: t.color.tinte2,
    leise: t.color.funkeWeich,
    nacht: t.color.nacht,
  }

  const container: ViewStyle = {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: t.space.s5,
    backgroundColor: bg[variant],
    borderWidth: t.space.kontur,
    borderColor: border[variant],
    borderRadius: t.radius.pille,
    ...(primary ? t.shadow.hart : null),
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
      onPress={() => {
        if (variant === 'primaer') void hapticMedium()
        onPress?.()
      }}
      style={({ pressed }) => [
        container,
        disabled && { opacity: 0.4 },
        pressed && !disabled && (primary
          ? { transform: [{ translateX: 3 }, { translateY: 3 }], shadowOpacity: 0, elevation: 0 }
          : { opacity: 0.7 }),
        style,
      ]}
    >
      {typeof children === 'string' ? <Text style={label}>{children}</Text> : children}
    </Pressable>
  )
}
