import { ScrollView, View, Text, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Card, Chip, Sticker, useTheme, useBreakpoint, WIDE_CONTENT_MAX_WIDTH, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'

export type FunnelPfad = 'angestellte' | 'rente' | 'ch'

export function pfadAusAntworten(answers: Readonly<Record<string, string | undefined>>): FunnelPfad {
  if (answers.job === 'Rente') return 'rente'
  if (answers.ausland === 'Ja, in die Schweiz') return 'ch'
  return 'angestellte'
}

export interface KontoWandScreenProps {
  readonly pfad: FunnelPfad
  readonly onRegister: () => void
  readonly onLogin: () => void
  readonly onLater: () => void
}

const SCHRITTE: Record<FunnelPfad, readonly string[]> = {
  angestellte: ['lstb', 'lebenslagen', 'sonderausgaben'],
  rente: ['rentenbescheid', 'kvpv'],
  ch: ['lohnausweis', 'nichtrueckkehrtage'],
}

export function KontoWandScreen({ pfad, onRegister, onLogin, onLater }: KontoWandScreenProps) {
  const t = useTheme()
  const bp = useBreakpoint()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <Sticker>{tr('funnel.kontoWand.sticker')}</Sticker>
      <Text style={styles.heading} accessibilityRole="header">
        {tr('funnel.kontoWand.titleBefore')}
        <Text style={styles.mark}>{tr(`funnel.kontoWand.pfad.${pfad}`)}</Text>
        {tr('funnel.kontoWand.titleAfter')}
      </Text>
      <Text style={styles.help}>{tr('funnel.kontoWand.help')}</Text>

      <Card>
        <Text style={styles.cardLabel}>{tr('funnel.kontoWand.nextLabel')}</Text>
        {SCHRITTE[pfad].map((schritt, index) => (
          <View key={schritt} style={styles.stepRow}>
            <Text style={styles.stepNumber}>{index + 1}</Text>
            <Text style={styles.stepText}>{tr(`funnel.kontoWand.schritte.${schritt}`)}</Text>
          </View>
        ))}
      </Card>

      <Text style={styles.honest}>{tr('funnel.kontoWand.honest')}</Text>

      <Button onPress={onRegister} style={styles.cta}>
        {tr('funnel.kontoWand.register')}
      </Button>
      <Button variante="ghost" onPress={onLogin} style={styles.secondaryCta}>
        {tr('funnel.kontoWand.login')}
      </Button>
      <View style={styles.laterRow}>
        <Chip onPress={onLater}>{tr('funnel.kontoWand.later')}</Chip>
      </View>
      <Text style={styles.note}>{tr('funnel.kontoWand.note')}</Text>
    </ScrollView>
  )
}

function makeStyles(t: UiTheme) {
  const screen: ViewStyle = {
    backgroundColor: t.color.grund,
    paddingHorizontal: t.space.s5,
    paddingTop: t.space.s6,
    paddingBottom: t.space.s7 * 2,
    minHeight: '100%',
    maxWidth: 460,
    width: '100%',
    alignSelf: 'center',
  }
  const wideScreen: ViewStyle = { ...screen, maxWidth: WIDE_CONTENT_MAX_WIDTH }
  const heading: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size['3xl'],
    color: t.color.tinte,
    marginTop: t.space.s4,
    marginBottom: t.space.s2,
  }
  const mark: TextStyle = {
    backgroundColor: t.color.funke,
    color: t.color.tinte,
    paddingHorizontal: t.space.s2,
    borderRadius: t.radius.s,
    overflow: 'hidden',
  }
  const help: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.m, marginBottom: t.space.s5 }
  const cardLabel: TextStyle = {
    fontFamily: t.font.mono,
    fontSize: t.size.xs,
    color: t.color.tinte2,
    textTransform: 'uppercase',
    letterSpacing: 0.08 * t.size.xs,
    marginBottom: t.space.s3,
  }
  const stepRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s3, paddingVertical: t.space.s2 }
  const stepNumber: TextStyle = {
    width: 28,
    height: 28,
    lineHeight: 24,
    textAlign: 'center',
    borderWidth: 2,
    borderColor: t.color.tinte,
    borderRadius: t.radius.pille,
    backgroundColor: t.color.funkeWeich,
    fontFamily: t.font.mono,
    fontSize: t.size.s,
    color: t.color.tinte,
    fontVariant: ['tabular-nums'],
    overflow: 'hidden',
  }
  const stepText: TextStyle = { flex: 1, fontFamily: t.font.text, fontSize: t.size.m, color: t.color.tinte }
  const honest: TextStyle = { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte2, marginTop: t.space.s4 }
  const cta: ViewStyle = { marginTop: t.space.s5 }
  const secondaryCta: ViewStyle = { marginTop: t.space.s3 }
  const laterRow: ViewStyle = { alignItems: 'center', marginTop: t.space.s4 }
  const note: TextStyle = { fontFamily: t.font.text, fontSize: t.size.xs, color: t.color.tinte2, textAlign: 'center', marginTop: t.space.s3 }
  return { screen, wideScreen, heading, mark, help, cardLabel, stepRow, stepNumber, stepText, honest, cta, secondaryCta, laterRow, note }
}
