// Herkunfts-Chip (fk-chip src) — Muster A: every number is touchable and reveals its origin
// (Beleg, Regel, Rechenweg). Load-bearing DS rule (design rule 2 / CLAUDE.md). Labels go through
// i18n (ui namespace); the tax term "Beleg" stays German in both locales (ADR-0006).
import { Pressable, View, Text, type ViewStyle, type TextStyle } from 'react-native'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../theme/useTheme'
import { UI_NS } from '../i18n/resources'

export interface Herkunft {
  readonly beleg?: string
  readonly regel: string
  readonly rechenweg?: string
}

export interface HerkunftsChipProps {
  readonly quelle: Herkunft
  readonly testID?: string
}

export function HerkunftsChip({ quelle, testID }: HerkunftsChipProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(UI_NS)
  const [open, setOpen] = useState(false)

  const chip: ViewStyle = {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 28,
    paddingVertical: 2,
    paddingHorizontal: 10,
    backgroundColor: t.color.funkeWeich,
    borderWidth: 2,
    borderColor: t.color.tinte,
    borderRadius: t.radius.pille,
  }
  const chipText: TextStyle = { fontSize: t.size.xs, fontWeight: t.weight.fett, color: t.color.tinte }

  const pop: ViewStyle = {
    marginTop: t.space.s2,
    width: 240,
    backgroundColor: t.color.karte,
    borderWidth: 2,
    borderColor: t.color.tinte,
    borderRadius: t.radius.s,
    padding: t.space.s3,
    ...t.shadow.hart,
  }
  const line: TextStyle = { fontSize: t.size.s, color: t.color.tinte, marginBottom: 2 }
  const strong: TextStyle = { fontWeight: t.weight.fett }
  const mono: TextStyle = { fontFamily: t.font.mono, fontSize: t.size.xs, fontVariant: ['tabular-nums'] }

  return (
    <View>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        style={chip}
      >
        <Text style={chipText}>{tr('herkunft.label')}</Text>
      </Pressable>
      {open && (
        <View accessibilityRole="summary" style={pop}>
          {quelle.beleg !== undefined && (
            <Text style={line}>
              <Text style={strong}>{tr('herkunft.beleg')}:</Text> {quelle.beleg}
            </Text>
          )}
          <Text style={line}>
            <Text style={strong}>{tr('herkunft.regel')}:</Text> <Text style={mono}>{quelle.regel}</Text>
          </Text>
          {quelle.rechenweg !== undefined && (
            <Text style={line}>
              <Text style={strong}>{tr('herkunft.rechenweg')}:</Text> <Text style={mono}>{quelle.rechenweg}</Text>
            </Text>
          )}
        </View>
      )}
    </View>
  )
}
