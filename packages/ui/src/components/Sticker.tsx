// Erfolgs-Sticker (fk-sticker) — slightly rotated, hard shadow. For deltas and finds. Max one
// visible success moment per journey (CLAUDE.md). Numbers tabular-nums.
import { View, Text, type ViewStyle, type TextStyle, type StyleProp } from 'react-native'
import { type ReactNode } from 'react'
import { useTheme } from '../theme/useTheme'

export interface StickerProps {
  readonly style?: StyleProp<ViewStyle>
  readonly children: ReactNode
  readonly testID?: string
}

export function Sticker({ style, children, testID }: StickerProps) {
  const t = useTheme()
  const container: ViewStyle = {
    alignSelf: 'flex-start',
    backgroundColor: t.color.funke,
    borderWidth: 2,
    borderColor: t.color.tinte,
    borderRadius: t.radius.s,
    paddingVertical: 2,
    paddingHorizontal: 10,
    transform: [{ rotate: '-2.5deg' }],
    ...t.shadow.hartS,
  }
  const label: TextStyle = {
    color: t.color.tinte,
    fontFamily: t.font.text,
    fontWeight: t.weight.schwer,
    fontVariant: ['tabular-nums'],
  }
  return (
    <View testID={testID} accessibilityRole="text" style={[container, style]}>
      {typeof children === 'string' ? <Text style={label}>{children}</Text> : children}
    </View>
  )
}
