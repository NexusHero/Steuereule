import { useEffect, useRef, useState } from 'react'
import { ScrollView, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Button, Card, WIDE_CONTENT_MAX_WIDTH, hapticWarning, useBreakpoint, useTheme, type UiTheme } from '@steuereule/ui'
import { useLinkControllerGet, useMasterDataControllerRead } from '@steuereule/api-client'
import type { Answers, Conflict, Notice } from '@steuereule/core'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'
import { APP_NS } from '../../i18n/resources'
import { useShellState } from '../../navigation/ShellState'
import { usePlausibility } from '../plausibility/usePlausibility'
import { tileRevisitFlag } from '../cockpit/CockpitTiles'
import { tileById, tilesForFinding, type TileId } from '../cockpit/tiles'
import { FilingTypeComparisonScreen } from '../filing-type-comparison/FilingTypeComparisonScreen'
import { BackButton, BackButtonSpacer } from '../shared/BackButton'
import { ErrorState, LoadingState } from '../shared/ScreenState'

export interface SubmissionScreenProps {
  readonly taxYear?: number
  readonly onBack?: () => void
  readonly onOpenTile: (target: TileId, revisit: boolean) => void
  readonly onOpenPrintout: (year: number) => void
}

export function SubmissionScreen({
  taxYear = CURRENT_TAX_YEAR,
  onBack,
  onOpenTile,
  onOpenPrintout,
}: SubmissionScreenProps) {
  const bp = useBreakpoint()
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const { confirmNotices, areNoticesConfirmed } = useShellState()
  const plausibility = usePlausibility(taxYear)
  const masterDataQuery = useMasterDataControllerRead()
  const isMarried =
    masterDataQuery.data?.status === 200 && masterDataQuery.data.data.familienstand === 'verheiratet'
  const linkQuery = useLinkControllerGet(taxYear, { query: { enabled: isMarried } })
  const [comparisonDone, setComparisonDone] = useState(false)
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

  if (plausibility.status === 'loading' || masterDataQuery.isPending || (isMarried && linkQuery.isPending)) {
    return <LoadingState bp={bp} label={tr('abgabe.loading')} />
  }
  if (plausibility.status === 'error') {
    return (
      <ErrorState
        bp={bp}
        heading={tr('abgabe.loadError.heading')}
        message={tr('abgabe.loadError.message')}
        retryLabel={tr('abgabe.loadError.retry')}
        onRetry={plausibility.retry}
      />
    )
  }

  const { conflicts, notices, answers } = plausibility
  const hasConflicts = conflicts.length > 0
  const noticesConfirmed = areNoticesConfirmed(taxYear, notices)
  const step1Passed = !hasConflicts && noticesConfirmed
  const isJointFiling =
    isMarried && linkQuery.data?.status === 200 && linkQuery.data.data.filingType === 'zusammen'
  const canOpenPrintout = step1Passed && (!isJointFiling || comparisonDone)

  const openFindingTile = (target: TileId) => {
    const revisit = tileRevisitFlag(tileById(target), answers)
    onOpenTile(target, revisit)
  }

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <View style={styles.headerRow}>
        {onBack ? <BackButton accessibilityLabel={tr('abgabe.back')} onPress={onBack} testID="abgabe-zurueck" /> : <BackButtonSpacer />}
      </View>

      <Text style={styles.heading}>{tr('abgabe.heading')}</Text>

      <Card variant="default" style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>{tr('abgabe.schrittPlausibilitaet')}</Text>
        {!hasConflicts && notices.length === 0 ? (
          <Text style={styles.okText}>{tr('abgabe.plausibilitaetOk')}</Text>
        ) : null}

        <FindingList
          titleKey="abgabe.widerspruchBlockiert"
          messagePrefix="plausibilitaet.widerspruch"
          items={conflicts}
          isBlocker
          answers={answers}
          onOpenTile={openFindingTile}
          styles={styles}
          tr={tr}
        />

        <FindingList
          titleKey="abgabe.hinweisPruefen"
          messagePrefix="plausibilitaet.hinweis"
          items={notices}
          isBlocker={false}
          answers={answers}
          onOpenTile={openFindingTile}
          styles={styles}
          tr={tr}
        />

        {!hasConflicts && notices.length > 0 && !noticesConfirmed ? (
          <Button
            onPress={() => confirmNotices(taxYear, notices.map((n) => n.kind))}
            style={styles.confirmBtn}
            testID="gate-warnung-bestaetigen"
          >
            {tr('abgabe.warnungenBestaetigen')}
          </Button>
        ) : null}
      </Card>

      {step1Passed && isJointFiling && !comparisonDone ? (
        <Card variant="default" style={styles.sectionCard} testID="abgabe-vergleich-abschnitt">
          <FilingTypeComparisonScreen embedded taxYear={taxYear} onDone={() => setComparisonDone(true)} />
          <Button
            variant="leise"
            onPress={() => setComparisonDone(true)}
            style={styles.skipBtn}
            testID="abgabe-vergleich-ueberspringen"
          >
            {tr('abgabe.vergleichUeberspringen')}
          </Button>
        </Card>
      ) : null}

      <Button
        onPress={() => onOpenPrintout(taxYear)}
        disabled={!canOpenPrintout}
        style={styles.printBtn}
        testID="abgabe-zum-ausdruck"
      >
        {tr('abgabe.zumAusdruck')}
      </Button>
    </ScrollView>
  )
}

function FindingList({
  titleKey,
  messagePrefix,
  items,
  isBlocker,
  onOpenTile,
  styles,
  tr,
}: {
  readonly titleKey: 'abgabe.widerspruchBlockiert' | 'abgabe.hinweisPruefen'
  readonly messagePrefix: 'plausibilitaet.widerspruch' | 'plausibilitaet.hinweis'
  readonly items: readonly (Conflict | Notice)[]
  readonly isBlocker: boolean
  readonly answers: Answers
  readonly onOpenTile: (target: TileId) => void
  readonly styles: ReturnType<typeof makeStyles>
  readonly tr: TFunction<typeof APP_NS>
}) {
  if (items.length === 0) return null
  return (
    <View style={styles.findingBlock}>
      <Text style={styles.findingHeading}>{tr(titleKey)}</Text>
      {items.map((finding, index) => {
        const targets = tilesForFinding(finding).filter((target): target is TileId => target !== 'abgabe')
        return (
          <View key={`${finding.kind}-${index}`} style={styles.findingRow}>
            <Text style={isBlocker ? styles.blockerText : styles.noticeText}>
              {tr(`${messagePrefix}.${finding.kind}`, { defaultValue: finding.kind })}
            </Text>
            {targets.map((target) => (
              <Button
                key={target}
                variant="ghost"
                onPress={() => onOpenTile(target)}
                style={styles.tileLinkBtn}
                testID={`abgabe-kachel-${target}`}
              >
                {tr('abgabe.zurKachel', { titel: tr(`cockpit.kachel.${target}.titel`) })}
              </Button>
            ))}
          </View>
        )
      })}
    </View>
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
    marginBottom: t.space.s4,
  }
  const sectionCard: ViewStyle = {
    marginBottom: t.space.s4,
    borderWidth: t.space.kontur,
    borderColor: t.color.tinte,
    ...t.shadow.hart,
  }
  const sectionTitle: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size.l,
    color: t.color.tinte,
    marginBottom: t.space.s2,
  }
  const okText: TextStyle = { fontFamily: t.font.text, fontSize: t.size.m, color: t.color.ok }
  const findingBlock: ViewStyle = { marginTop: t.space.s2, gap: t.space.s2 }
  const findingHeading: TextStyle = {
    fontFamily: t.font.text,
    fontWeight: t.weight.fett,
    fontSize: t.size.s,
    color: t.color.tinte,
  }
  const findingRow: ViewStyle = { gap: t.space.s2, marginBottom: t.space.s2 }
  const blockerText: TextStyle = { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.fehler }
  const noticeText: TextStyle = { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.warn }
  const tileLinkBtn: ViewStyle = { alignSelf: 'flex-start' }
  const confirmBtn: ViewStyle = { marginTop: t.space.s3 }
  const skipBtn: ViewStyle = { marginTop: t.space.s3 }
  const printBtn: ViewStyle = { marginTop: t.space.s2 }

  return {
    screen,
    wideScreen,
    headerRow,
    heading,
    sectionCard,
    sectionTitle,
    okText,
    findingBlock,
    findingHeading,
    findingRow,
    blockerText,
    noticeText,
    tileLinkBtn,
    confirmBtn,
    skipBtn,
    printBtn,
  }
}
