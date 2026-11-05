import { ScrollView, View, Text, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, useTheme, useBreakpoint, WIDE_CONTENT_MAX_WIDTH, type UiTheme } from '@steuereule/ui'
import {
  employeeFromData,
  calculateEmployeeStatus,
  wageTaxCertificateStatus,
  pruefePlausibilitaet,
  type Answers,
  type WageTaxCertificateData,
  type WageTaxCertificateFieldState,
} from '@steuereule/core'
import {
  useInterviewControllerGetInterview,
  useLstbControllerGetLstb,
  useStammdatenControllerLese,
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
  const stammdatenQuery = useStammdatenControllerLese()

  if (lstbQuery.isPending || interviewQuery.isPending || stammdatenQuery.isPending) {
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
  // The Stammdaten are not part of the core check, but the printout cannot go out without them —
  // "nichts mehr offen" must not be claimed while they (or their state) are missing.
  const missingPersonalDetails =
    stammdatenQuery.data?.status === 200 ? stammdatenQuery.data.data.fehlend.length : null
  const allClear = ergebnis.kind === 'einreichbar' && missingPersonalDetails === 0

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <View style={styles.headerRow}>
        {onBack ? <BackButton accessibilityLabel={tr('plausibilitaet.back')} onPress={onBack} /> : <BackButtonSpacer />}
      </View>

      <Text style={styles.heading}>{tr('plausibilitaet.heading')}</Text>

      <Text style={styles.werktageNote}>{tr('plausibilitaet.werktageNote')}</Text>

      {allClear ? (
        <Text style={styles.einreichbar}>{tr('plausibilitaet.einreichbar')}</Text>
      ) : (
        <Text style={styles.nichtEinreichbar}>{tr('plausibilitaet.nichtEinreichbar')}</Text>
      )}
      {missingPersonalDetails !== null && missingPersonalDetails > 0 ? (
        <Text style={styles.nichtEinreichbar}>{tr('plausibilitaet.stammdatenOffen', { count: missingPersonalDetails })}</Text>
      ) : null}
      {missingPersonalDetails === null ? <Text style={styles.nichtEinreichbar}>{tr('plausibilitaet.stammdatenUnbekannt')}</Text> : null}

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

function datenAusResponse(r: LstbResponseDto): WageTaxCertificateData {
  return {
    bruttoarbeitslohn: r.bruttoarbeitslohn as WageTaxCertificateFieldState,
    lohnsteuer: r.lohnsteuer as WageTaxCertificateFieldState,
    sozialversicherung: r.sozialversicherung as WageTaxCertificateFieldState,
  }
}

function fold(daten: WageTaxCertificateData, answers: Answers) {
  const fakten = employeeFromData(daten, answers)

  return {
    lstb: wageTaxCertificateStatus(daten),
    werktage: { kind: 'bestimmt' as const, wochentage: 0, werktage: 0, pendlertage: 0 },
    stand: calculateEmployeeStatus({
      income: fakten.einnahmen,
      incomeRelatedExpenses: fakten.werbungskosten,
      specialExpenses: fakten.sonderausgaben,
      openItems: fakten.offenePosten,
      conflicts: fakten.konflikte,
      gated: fakten.gegated,
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
