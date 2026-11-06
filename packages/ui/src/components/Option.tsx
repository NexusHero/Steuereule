import { Pressable, Text, type ViewStyle, type TextStyle, type StyleProp } from 'react-native'
import { type ReactNode } from 'react'
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
    backgroundColor: selected ? t.color.funke : t.color.karte,
    borderWidth: t.space.kontur,
    borderColor: t.color.tinte,
    borderRadius: t.radius.s,
    ...(selected ? t.shadow.hartS : null),
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
      onPress={onPress}
      style={({ pressed }) => [
        container,
        pressed && !selected && { transform: [{ translateX: -1 }, { translateY: -1 }], ...t.shadow.hartS },
        style,
      ]}
    >
      {typeof children === 'string' ? <Text style={label}>{children}</Text> : children}
    </Pressable>
  )
}
