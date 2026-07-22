// KI-Absender-Chip (fk-ai-chip) — Violett-Territorium, the ONLY place --ki appears. Always marked
// with the "B" owl dot so KI output stays recognizable (design rule: violet = AI only).
import { View, Text, type ViewStyle, type TextStyle, type StyleProp } from 'react-native'
import { type ReactNode } from 'react'
import { useTheme } from '../theme/useTheme'

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
    backgroundColor: t.color.kiWeich,
    borderWidth: 2,
    borderColor: t.color.ki,
    borderRadius: t.radius.pille,
    paddingVertical: 4,
    paddingLeft: 6,
    paddingRight: 12,
  }
  const dot: ViewStyle = {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: t.color.ki,
    alignItems: 'center',
    justifyContent: 'center',
  }
  const dotText: TextStyle = { color: '#ffffff', fontWeight: t.weight.schwer, fontSize: 10 }
  const label: TextStyle = { color: t.color.kiTinte, fontWeight: t.weight.fett, fontSize: t.size.xs }

  return (
    <View testID={testID} accessibilityLabel="KI" style={[container, style]}>
      <View style={dot}>
        <Text style={dotText} accessible={false}>
          B
        </Text>
      </View>
      {typeof children === 'string' ? <Text style={label}>{children}</Text> : children}
    </View>
  )
}
