import { ScrollView, View, Text, type ViewStyle, type TextStyle } from 'react-native'
import { type ReactNode } from 'react'
import { useTheme } from '../theme/useTheme'
import { Card } from '../components/Card'
import { Button, type ButtonVariant } from '../components/Button'
import { Pill } from '../components/Pill'
import { Sticker } from '../components/Sticker'
import { AiChip } from '../components/AiChip'
import { ProvenanceChip } from '../components/HerkunftsChip'

function Section({ title, children }: { title: string; children: ReactNode }) {
  const t = useTheme()
  const heading: TextStyle = {
    fontFamily: t.font.mono,
    fontSize: t.size.xs,
    letterSpacing: 0.08 * t.size.xs,
    textTransform: 'uppercase',
    color: t.color.tinte2,
    marginBottom: t.space.s2,
    marginTop: t.space.s5,
  }
  const row: ViewStyle = { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2, alignItems: 'center' }
  return (
    <View>
      <Text style={heading}>{title}</Text>
      <View style={row}>{children}</View>
    </View>
  )
}

const BUTTON_VARIANTS: readonly ButtonVariant[] = ['primaer', 'ghost', 'leise', 'nacht']

export function Gallery() {
  const t = useTheme()
  const screen: ViewStyle = { backgroundColor: t.color.grund, padding: t.space.s4 }
  const heroLabel: TextStyle = {
    fontFamily: t.font.mono,
    fontSize: t.size.xs,
    color: t.color.funkeHell,
    textTransform: 'uppercase',
    letterSpacing: 0.08 * t.size.xs,
  }
  const heroValue: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size['3xl'],
    color: t.color.funke,
    fontVariant: ['tabular-nums'],
  }

  return (
    <ScrollView contentContainerStyle={screen}>
      <Section title="Karte · Held">
        <Card variant="nacht" style={{ width: '100%' }}>
          <Text style={heroLabel}>Voraussichtliche Erstattung</Text>
          <Text style={heroValue}>1.227–1.587 €</Text>
          <View style={{ marginTop: t.space.s2, alignSelf: 'flex-start' }}>
            <ProvenanceChip source={{ rule: 'SCHÄTZ-01 · Stand 2026', calculationPath: 'Spanne = offene Angaben × 60 €' }} />
          </View>
        </Card>
      </Section>

      <Section title="Karte · KI">
        <Card variant="ai" style={{ width: '100%' }}>
          <AiChip>Berater</AiChip>
        </Card>
      </Section>

      <Section title="Button">
        {BUTTON_VARIANTS.map((v) => (
          <Button key={v} variant={v}>
            {v}
          </Button>
        ))}
        <Button disabled>disabled</Button>
      </Section>

      <Section title="Pille & Sticker">
        <Pill>2026</Pill>
        <Sticker>+122 €</Sticker>
      </Section>

      <Section title="Herkunft">
        <ProvenanceChip source={{ receipt: 'Lohnsteuerbescheinigung', rule: 'WK-N-01', calculationPath: '1.230 € Pauschbetrag' }} />
      </Section>
    </ScrollView>
  )
}
