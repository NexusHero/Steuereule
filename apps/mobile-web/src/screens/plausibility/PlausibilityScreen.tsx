import { useEffect, useRef } from 'react'
import { ScrollView, View, Text, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, hapticWarning, useTheme, useBreakpoint, WIDE_CONTENT_MAX_WIDTH, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'
import { LoadingState, ErrorState } from '../shared/ScreenState'
import { BackButton, BackButtonSpacer } from '../shared/BackButton'
import { usePlausibility } from './usePlausibility'

export interface PlausibilityScreenProps {
  readonly onBack?: () => void
  readonly onDone?: () => void
  readonly taxYear?: number
}

export function PlausibilityScreen({ onBack, onDone, taxYear = CURRENT_TAX_YEAR }: PlausibilityScreenProps) {
  const bp = useBreakpoint()
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const plausibility = usePlausibility(taxYear)
  const hasBlockingConflict = plausibility.status === 'ready' && plausibility.conflicts.length > 0
  const prevConflictRef = useRef<{ taxYear: number; active: boolean }>({ taxYear, active: false })

  useEffect(() => {
    if (prevConflictRef.current.taxYear !== taxYear) {
      prevConflictRef.current = { taxYear, active: false }
    }
    if (!prevConflictRef.current.active && hasBlockingConflict) {
      void hapticWarning()
    }
    prevConflictRef.current.active = hasBlockingConflict
  }, [taxYear, hasBlockingConflict])

  if (plausibility.status === 'loading') {
    return <LoadingState bp={bp} label={tr('plausibilitaet.loading')} />
  }
  if (plausibility.status === 'error') {
    return (
      <ErrorState
        bp={bp}
        heading={tr('plausibilitaet.loadError.heading')}
        message={tr('plausibilitaet.loadError.message')}
        retryLabel={tr('plausibilitaet.loadError.retry')}
        onRetry={plausibility.retry}
      />
    )
  }

  const { conflicts, notices, missingPersonalDetails } = plausibility
  const allClear = conflicts.length === 0 && missingPersonalDetails === 0

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

      {conflicts.length > 0 ? (
        <View style={styles.block}>
          <Text style={styles.blockHeading}>{tr('plausibilitaet.widersprueche')}</Text>
          {conflicts.map((w, i) => (
            <Text key={i} style={styles.widerspruchItem}>
              {tr(`plausibilitaet.widerspruch.${w.kind}`, { defaultValue: w.kind })}
            </Text>
          ))}
        </View>
      ) : null}

      {notices.length > 0 ? (
        <View style={styles.block}>
          <Text style={styles.blockHeading}>{tr('plausibilitaet.hinweise')}</Text>
          {notices.map((h, i) => (
            <Text key={i} style={styles.hinweisItem}>
              {tr(`plausibilitaet.hinweis.${h.kind}`, { defaultValue: h.kind })}
            </Text>
          ))}
        </View>
      ) : null}

      {onDone ? (
        <Button onPress={onDone} style={styles.doneCta} testID="plausibilitaet-weiter">
          {tr('plausibilitaet.weiterZumVergleich')}
        </Button>
      ) : null}
    </ScrollView>
  )
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
  const workdaysNote: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.s, marginBottom: t.space.s3 }
  const submittable: TextStyle = { color: t.color.ok, fontFamily: t.font.display, fontWeight: t.weight.schwer, fontSize: t.size.l, marginBottom: t.space.s4 }
  const notSubmittable: TextStyle = { color: t.color.warn, fontFamily: t.font.display, fontWeight: t.weight.schwer, fontSize: t.size.l, marginBottom: t.space.s4 }
  const block: ViewStyle = { marginBottom: t.space.s4, padding: t.space.s3, backgroundColor: t.color.karte, borderWidth: t.space.kontur, borderColor: t.color.linieWeich, borderRadius: t.radius.s }
  const blockHeading: TextStyle = { color: t.color.tinte, fontFamily: t.font.display, fontWeight: t.weight.schwer, fontSize: t.size.m, marginBottom: t.space.s2 }
  const conflictItem: TextStyle = { color: t.color.fehler, fontFamily: t.font.text, fontSize: t.size.s, marginBottom: t.space.s1 }
  const noticeItem: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.s, marginBottom: t.space.s1 }
  const doneCta: ViewStyle = { marginTop: t.space.s4 }
  return { screen, wideScreen, headerRow, heading, werktageNote: workdaysNote, einreichbar: submittable, nichtEinreichbar: notSubmittable, block, blockHeading, widerspruchItem: conflictItem, hinweisItem: noticeItem, doneCta }
}
