// Form field (fk-feld) — label above the control, optional error line below (honest error state).
import { View, Text, type ViewStyle, type TextStyle } from 'react-native'
import { type ReactNode } from 'react'
import { useTheme } from '../theme/useTheme'

export interface FeldProps {
  readonly label: string
  readonly fehler?: string
  readonly children: ReactNode
}

export function Feld({ label, fehler, children }: FeldProps) {
  const t = useTheme()
  const wrap: ViewStyle = { marginBottom: t.space.s3 }
  const labelStyle: TextStyle = {
    fontSize: t.size.s,
    fontWeight: t.weight.fett,
    color: t.color.tinte,
    marginBottom: t.space.s1,
  }
  const errorStyle: TextStyle = { color: t.color.fehler, fontSize: t.size.s, marginTop: t.space.s1 }
  return (
    <View style={wrap}>
      <Text style={labelStyle}>{label}</Text>
      {children}
      {fehler !== undefined && fehler !== '' ? (
        <Text style={errorStyle} accessibilityRole="alert">
          {fehler}
        </Text>
      ) : null}
    </View>
  )
}
