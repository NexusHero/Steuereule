// Karte (fk-karte). Ruhe-Hierarchie: normal cards whisper (fine line, no shadow); only the
// nacht/held hero and the KI card carry a 2px ink contour + hard shadow (komponenten.css, CLAUDE.md).
import { View, type ViewStyle, type StyleProp } from 'react-native'
import { type ReactNode } from 'react'
import { useTheme } from '../theme/useTheme'

export type CardVariant = 'default' | 'nacht' | 'ai'

export interface CardProps {
  readonly variant?: CardVariant
  readonly style?: StyleProp<ViewStyle>
  readonly children: ReactNode
  readonly testID?: string
}

export function Card({ variant = 'default', style, children, testID }: CardProps) {
  const t = useTheme()
  const base: ViewStyle = {
    borderRadius: t.radius.m,
    padding: t.space.s4,
    marginBottom: t.space.s4,
  }
  const byVariant: Record<CardVariant, ViewStyle> = {
    default: {
      backgroundColor: t.color.karte,
      borderWidth: 1.5,
      borderColor: t.color.linieWeich,
    },
    nacht: {
      backgroundColor: t.color.nacht,
      borderWidth: 2,
      borderColor: t.color.tinte,
      ...t.shadow.hart,
    },
    ai: {
      backgroundColor: t.color.kiWeich,
      borderWidth: 2,
      borderColor: t.color.ki,
      ...t.shadow.ki,
    },
  }
  return (
    <View testID={testID} style={[base, byVariant[variant], style]}>
      {children}
    </View>
  )
}
