import { Pressable, View, Text, type ViewStyle, type TextStyle } from 'react-native'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../theme/useTheme'
import { UI_NS } from '../i18n/resources'

export type ProvenanceChipVariant = 'default' | 'ok' | 'pruefen'

export interface Provenance {
  readonly receipt?: string
  readonly rule: string
  readonly calculationPath?: string
  readonly reason?: string
}

export interface ProvenanceChipProps {
  readonly source: Provenance
  readonly variant?: ProvenanceChipVariant
  readonly testID?: string
}

export function ProvenanceChip({ source, variant = 'default', testID }: ProvenanceChipProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(UI_NS)
  const [open, setOpen] = useState(false)

  const backgroundColor =
    variant === 'ok'
      ? t.color.okWeich
      : variant === 'pruefen'
        ? t.color.warnWeich
        : t.color.funkeWeich
  const borderColor =
    variant === 'ok'
      ? t.color.ok
      : variant === 'pruefen'
        ? t.color.warn
        : t.color.tinte

  const chip: ViewStyle = {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 28,
    paddingVertical: 2,
    paddingHorizontal: 10,
    backgroundColor,
    borderWidth: 2,
    borderColor,
    borderRadius: t.radius.pille,
  }
  const chipText: TextStyle = { fontSize: t.size.xs, fontWeight: t.weight.fett, color: t.color.tinte }

  const pop: ViewStyle = {
    marginTop: t.space.s2,
    width: 260,
    backgroundColor: t.color.karte,
    borderWidth: 2,
    borderColor,
    borderRadius: t.radius.s,
    padding: t.space.s3,
  }
  const line: TextStyle = { fontSize: t.size.s, color: t.color.tinte, marginBottom: 2 }
  const strong: TextStyle = { fontWeight: t.weight.fett }
  const mono: TextStyle = { fontFamily: t.font.mono, fontSize: t.size.xs, fontVariant: ['tabular-nums'] }

  const badgeLabel =
    variant === 'ok'
      ? `✓ ${tr('herkunft.label')}`
      : variant === 'pruefen'
        ? `! ${tr('herkunft.pruefenBadge')} · ${tr('herkunft.label')}`
        : tr('herkunft.label')

  return (
    <View>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        style={chip}
      >
        <Text style={chipText}>{badgeLabel}</Text>
      </Pressable>
      {open && (
        <View accessibilityRole="summary" style={pop}>
          {source.receipt !== undefined && (
            <Text style={line}>
              <Text style={strong}>{tr('herkunft.beleg')}:</Text> {source.receipt}
            </Text>
          )}
          <Text style={line}>
            <Text style={strong}>{tr('herkunft.regel')}:</Text> <Text style={mono}>{source.rule}</Text>
          </Text>
          {source.calculationPath !== undefined && (
            <Text style={line}>
              <Text style={strong}>{tr('herkunft.rechenweg')}:</Text> <Text style={mono}>{source.calculationPath}</Text>
            </Text>
          )}
          {source.reason !== undefined && (
            <Text style={line}>
              <Text style={strong}>{tr('herkunft.hinweis')}:</Text> {source.reason}
            </Text>
          )}
        </View>
      )}
    </View>
  )
}
