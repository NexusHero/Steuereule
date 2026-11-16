import { View, Text, type ViewStyle, type TextStyle, type StyleProp } from 'react-native'
import { type ReactNode } from 'react'
import { useTheme } from '../theme/useTheme'
import { OwlGlyph } from './OwlGlyph'

export interface AiChipProps {
  readonly style?: StyleProp<ViewStyle>
  readonly children: ReactNode
  readonly testID?: string
}

export function AiChip({ style, children, testID }: AiChipProps) {
  const t = useTheme()
  const container: ViewStyle = {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: t.color.funkeWeich,
    borderWidth: 1.5,
    borderColor: t.color.tinte,
    borderRadius: t.radius.pille,
    paddingVertical: 4,
    paddingLeft: 6,
    paddingRight: 12,
  }
  const label: TextStyle = { color: t.color.tinte, fontWeight: t.weight.fett, fontSize: t.size.xs }

  return (
    <View testID={testID} accessibilityLabel="KI" style={[container, style]}>
      <OwlGlyph ink={t.color.tinte} ground={t.color.funkeWeich} />
      {typeof children === 'string' ? <Text style={label}>{children}</Text> : children}
    </View>
  )
}
