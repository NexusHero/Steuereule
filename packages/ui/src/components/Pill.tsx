import { View, Text, type ViewStyle, type TextStyle, type StyleProp } from 'react-native'
import { type ReactNode } from 'react'
import { useTheme } from '../theme/useTheme'

export interface PillProps {
  readonly style?: StyleProp<ViewStyle>
  readonly children: ReactNode
  readonly testID?: string
}

export function Pill({ style, children, testID }: PillProps) {
  const t = useTheme()
  const container: ViewStyle = {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.color.karte,
    borderWidth: 2,
    borderColor: t.color.tinte,
    borderRadius: t.radius.pille,
    paddingVertical: 4,
    paddingHorizontal: 12,
  }
  const label: TextStyle = {
    fontFamily: t.font.mono,
    fontSize: t.size.xs,
    color: t.color.tinte,
    letterSpacing: 0.08 * t.size.xs,
    textTransform: 'uppercase',
    fontVariant: ['tabular-nums'],
  }
  return (
    <View testID={testID} style={[container, style]}>
      {typeof children === 'string' ? <Text style={label}>{children}</Text> : children}
    </View>
  )
}
