import { ScrollView, View, Text, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Card, Chip, Sticker, useTheme, useBreakpoint, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'

export type FunnelPath = 'angestellte' | 'rente' | 'ch'

export function pathFromAnswers(answers: Readonly<Record<string, string | undefined>>): FunnelPath {
  if (answers.job === 'Rente') return 'rente'
  if (answers.ausland === 'Ja, in die Schweiz') return 'ch'
  return 'angestellte'
}

export interface AccountWallScreenProps {
  readonly path: FunnelPath
  readonly onRegister: () => void
  readonly onLogin: () => void
  readonly onLater: () => void
}

const STEPS: Record<FunnelPath, readonly string[]> = {
  angestellte: ['lstb', 'lebenslagen', 'sonderausgaben'],
  rente: ['rentenbescheid', 'kvpv'],
  ch: ['lohnausweis', 'nichtrueckkehrtage'],
}

export function AccountWallScreen({ path, onRegister, onLogin, onLater }: AccountWallScreenProps) {
  const t = useTheme()
  const bp = useBreakpoint()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <Sticker>{tr('funnel.kontoWand.sticker')}</Sticker>
      <Text style={styles.heading} accessibilityRole="header">
        {tr('funnel.kontoWand.titleBefore')}
        <Text style={styles.mark}>{tr(`funnel.kontoWand.pfad.${path}`)}</Text>
        {tr('funnel.kontoWand.titleAfter')}
      </Text>
      <Text style={styles.help}>{tr('funnel.kontoWand.help')}</Text>

      <Card>
        <Text style={styles.cardLabel}>{tr('funnel.kontoWand.nextLabel')}</Text>
        {STEPS[path].map((step, index) => (
          <View key={step} style={styles.stepRow}>
            <Text style={styles.stepNumber}>{index + 1}</Text>
            <Text style={styles.stepText}>{tr(`funnel.kontoWand.schritte.${step}`)}</Text>
          </View>
        ))}
      </Card>

      <Text style={styles.honest}>{tr('funnel.kontoWand.honest')}</Text>

      <Button onPress={onRegister} style={styles.cta}>
        {tr('funnel.kontoWand.register')}
      </Button>
      <Button variant="ghost" onPress={onLogin} style={styles.secondaryCta}>
        {tr('funnel.kontoWand.login')}
      </Button>
      <View style={styles.laterRow}>
        <Chip onPress={onLater} testID="konto-wand-spaeter">{tr('funnel.kontoWand.later')}</Chip>
      </View>
      <Text style={styles.note}>{tr('funnel.kontoWand.note')}</Text>
    </ScrollView>
  )
}

function makeStyles(t: UiTheme) {
  const screen: ViewStyle = { ...t.layout.flow.narrow, paddingTop: t.space.s6, paddingBottom: t.space.s7 * 2 }
  const wideScreen: ViewStyle = { ...t.layout.flow.wide, paddingTop: t.space.s6, paddingBottom: t.space.s7 * 2 }
  const heading: TextStyle = {
    ...t.type.title,
    color: t.color.tinte,
    marginTop: t.space.s4,
    marginBottom: t.space.s2,
  }
  // "Funke ruhig": the key word is set in readable dark lime, no lime box behind it.
  const mark: TextStyle = { color: t.color.funkeTinte }
  const help: TextStyle = { ...t.type.body, color: t.color.tinte2, marginBottom: t.space.s5 }
  const cardLabel: TextStyle = {
    ...t.type.meta,
    color: t.color.tinte2,
    textTransform: 'uppercase',
    letterSpacing: 0.08 * t.size.xs,
    marginBottom: t.space.s3,
  }
  const stepRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s3, paddingVertical: t.space.s2 }
  const stepNumber: TextStyle = {
    ...t.type.metaLarge,
    width: 28,
    height: 28,
    lineHeight: 24,
    textAlign: 'center',
    borderWidth: 2,
    borderColor: t.color.tinte,
    borderRadius: t.radius.pille,
    backgroundColor: t.color.funkeWeich,
    color: t.color.tinte,
    fontVariant: ['tabular-nums'],
    overflow: 'hidden',
  }
  const stepText: TextStyle = { ...t.type.body, flex: 1, color: t.color.tinte }
  const honest: TextStyle = { ...t.type.small, color: t.color.tinte2, marginTop: t.space.s4 }
  const cta: ViewStyle = { marginTop: t.space.s5 }
  const secondaryCta: ViewStyle = { marginTop: t.space.s3 }
  const laterRow: ViewStyle = { alignItems: 'center', marginTop: t.space.s4 }
  const note: TextStyle = { ...t.type.caption, color: t.color.tinte2, textAlign: 'center', marginTop: t.space.s3 }
  return { screen, wideScreen, heading, mark, help, cardLabel, stepRow, stepNumber, stepText, honest, cta, secondaryCta, laterRow, note }
}
