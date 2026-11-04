import { ScrollView, View, Text, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, useTheme, useBreakpoint, WIDE_CONTENT_MAX_WIDTH, type UiTheme } from '@steuereule/ui'
import {
  angestellteAusDaten,
  angestelltenStand,
  lstbZustand,
  pruefePlausibilitaet,
  type Answers,
  type LstbDaten,
  type LstbFeldZustand,
} from '@steuereule/core'
import {
  useInterviewControllerGetInterview,
  useLstbControllerGetLstb,
  type LstbResponseDto,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'
import { LoadingState, ErrorState } from '../shared/ScreenState'
import { BackButton, BackButtonSpacer } from '../shared/BackButton'

export interface PlausibilitaetScreenProps {
  readonly onBack?: () => void
  readonly onDone?: () => void
  readonly taxYear?: number
}

export function PlausibilitaetScreen({ onBack, onDone, taxYear = CURRENT_TAX_YEAR }: PlausibilitaetScreenProps) {
  const bp = useBreakpoint()
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const lstbQuery = useLstbControllerGetLstb(taxYear)
  const interviewQuery = useInterviewControllerGetInterview(taxYear)

  if (lstbQuery.isPending || interviewQuery.isPending) {
    return <LoadingState bp={bp} label={tr('plausibilitaet.loading')} />
  }
  if (lstbQuery.isError || lstbQuery.data.status !== 200 || interviewQuery.isError || interviewQuery.data.status !== 200) {
    return (
      <ErrorState
        bp={bp}
        heading={tr('plausibilitaet.loadError.heading')}
        message={tr('plausibilitaet.loadError.message')}
        retryLabel={tr('plausibilitaet.loadError.retry')}
        onRetry={() => {
          void lstbQuery.refetch()
          void interviewQuery.refetch()
        }}
      />
    )
  }

  const daten = datenAusResponse(lstbQuery.data.data)
  const answers = interviewQuery.data.data.answers as Answers
  const ergebnis = pruefePlausibilitaet(fold(daten, answers))

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <View style={styles.headerRow}>
        {onBack ? <BackButton accessibilityLabel={tr('plausibilitaet.back')} onPress={onBack} /> : <BackButtonSpacer />}
      </View>

      <Text style={styles.heading}>{tr('plausibilitaet.heading')}</Text>

      <Text style={styles.werktageNote}>{tr('plausibilitaet.werktageNote')}</Text>

      {ergebnis.kind === 'einreichbar' ? (
        <Text style={styles.einreichbar}>{tr('plausibilitaet.einreichbar')}</Text>
      ) : (
        <Text style={styles.nichtEinreichbar}>{tr('plausibilitaet.nichtEinreichbar')}</Text>
      )}

      {ergebnis.kind === 'nicht-einreichbar' && ergebnis.widersprueche.length > 0 ? (
        <View style={styles.block}>
          <Text style={styles.blockHeading}>{tr('plausibilitaet.widersprueche')}</Text>
          {ergebnis.widersprueche.map((w, i) => (
            <Text key={i} style={styles.widerspruchItem}>
              {tr(`plausibilitaet.widerspruch.${w.art}`, { defaultValue: w.art })}
            </Text>
          ))}
        </View>
      ) : null}

      {ergebnis.hinweise.length > 0 ? (
        <View style={styles.block}>
          <Text style={styles.blockHeading}>{tr('plausibilitaet.hinweise')}</Text>
          {ergebnis.hinweise.map((h, i) => (
            <Text key={i} style={styles.hinweisItem}>
              {tr(`plausibilitaet.hinweis.${h.art}`, { defaultValue: h.art })}
            </Text>
          ))}
        </View>
      ) : null}

      {onDone ? (
        <Button onPress={onDone} style={styles.doneCta}>
          {tr('plausibilitaet.weiterZumVergleich')}
        </Button>
      ) : null}
    </ScrollView>
  )
}

function datenAusResponse(r: LstbResponseDto): LstbDaten {
  return {
    bruttoarbeitslohn: r.bruttoarbeitslohn as LstbFeldZustand,
    lohnsteuer: r.lohnsteuer as LstbFeldZustand,
    sozialversicherung: r.sozialversicherung as LstbFeldZustand,
  }
}

function fold(daten: LstbDaten, answers: Answers) {
  const fakten = angestellteAusDaten(daten, answers)

  return {
    lstb: lstbZustand(daten),
    werktage: { kind: 'bestimmt' as const, wochentage: 0, werktage: 0, pendlertage: 0 },
    stand: angestelltenStand({
      einnahmen: fakten.einnahmen,
      werbungskosten: fakten.werbungskosten,
      sonderausgaben: fakten.sonderausgaben,
      offenePosten: fakten.offenePosten,
      konflikte: fakten.konflikte,
      gegated: fakten.gegated,
    }),
    erfasstNichtGerechnet: fakten.erfasstNichtGerechnet,
  }
}

function makeStyles(t: UiTheme) {
  const screen: ViewStyle = {
    backgroundColor: t.color.grund,
    paddingHorizontal: t.space.s5,
    paddingVertical: t.space.s6,
    minHeight: '100%',
    maxWidth: 460,
    width: '100%',
    alignSelf: 'center',
  }
  const wideScreen: ViewStyle = { ...screen, maxWidth: WIDE_CONTENT_MAX_WIDTH }
  const headerRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', marginBottom: t.space.s4 }
  const heading: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size['2xl'],
    color: t.color.tinte,
    marginBottom: t.space.s3,
  }
  const werktageNote: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.s, marginBottom: t.space.s3 }
  const einreichbar: TextStyle = { color: t.color.ok, fontFamily: t.font.display, fontWeight: t.weight.schwer, fontSize: t.size.l, marginBottom: t.space.s4 }
  const nichtEinreichbar: TextStyle = { color: t.color.warn, fontFamily: t.font.display, fontWeight: t.weight.schwer, fontSize: t.size.l, marginBottom: t.space.s4 }
  const block: ViewStyle = { marginBottom: t.space.s4, padding: t.space.s3, backgroundColor: t.color.karte, borderWidth: t.space.kontur, borderColor: t.color.linieWeich, borderRadius: t.radius.s }
  const blockHeading: TextStyle = { color: t.color.tinte, fontFamily: t.font.display, fontWeight: t.weight.schwer, fontSize: t.size.m, marginBottom: t.space.s2 }
  const widerspruchItem: TextStyle = { color: t.color.fehler, fontFamily: t.font.text, fontSize: t.size.s, marginBottom: t.space.s1 }
  const hinweisItem: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.s, marginBottom: t.space.s1 }
  const doneCta: ViewStyle = { marginTop: t.space.s4 }
  return { screen, wideScreen, headerRow, heading, werktageNote, einreichbar, nichtEinreichbar, block, blockHeading, widerspruchItem, hinweisItem, doneCta }
}
