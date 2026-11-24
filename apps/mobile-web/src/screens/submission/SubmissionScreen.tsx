import { useState } from 'react'
import { ScrollView, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Button, Card, useBreakpoint, useTheme, type UiTheme } from '@steuereule/ui'
import { useLinkControllerGet, useMasterDataControllerRead, useUnlockControllerStatus } from '@steuereule/api-client'
import type { Answers, Conflict, Notice } from '@steuereule/core'
import { CURRENT_TAX_YEAR, isRunningTaxYear } from '../../config/taxYear'
import { APP_NS } from '../../i18n/resources'
import { useApiFailureMessage } from '../../net/apiFailure'
import { useShellState } from '../../navigation/ShellState'
import { usePlausibility } from '../plausibility/usePlausibility'
import { useBlockingConflictHaptic } from '../plausibility/useBlockingConflictHaptic'
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
  /** A year with self-employment is filed through Mein ELSTER: the way on leads to the fill-in help. */
  readonly onOpenElsterHelp?: (year: number) => void
}

export function SubmissionScreen({
  taxYear = CURRENT_TAX_YEAR,
  onBack,
  onOpenTile,
  onOpenPrintout,
  onOpenElsterHelp,
}: SubmissionScreenProps) {
  const bp = useBreakpoint()
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const { confirmNotices, areNoticesConfirmed } = useShellState()
  const failureMessage = useApiFailureMessage()
  const plausibility = usePlausibility(taxYear)
  const unlock = useUnlockControllerStatus(taxYear, { query: { enabled: onOpenElsterHelp !== undefined } })
  const viaElster = onOpenElsterHelp !== undefined && unlock.data?.data.filingPath === 'elster-ausfuellhilfe'
  const masterDataQuery = useMasterDataControllerRead()
  const isMarried = masterDataQuery.data?.data.familienstand === 'verheiratet'
  const linkQuery = useLinkControllerGet(taxYear, { query: { enabled: isMarried } })
  const [comparisonOpen, setComparisonOpen] = useState(false)
  const hasBlockingConflict = plausibility.status === 'ready' && plausibility.conflicts.length > 0
  useBlockingConflictHaptic(taxYear, hasBlockingConflict)

  const unlockRead = onOpenElsterHelp !== undefined
  if (plausibility.status === 'loading' || masterDataQuery.isPending || (isMarried && linkQuery.isPending) || (unlockRead && unlock.isPending)) {
    return <LoadingState bp={bp} label={tr('abgabe.loading')} />
  }
  // NC-18: the unlock decides between printout and ELSTER help, the master data and the coupling whether a
  // couple gets the comparison: a failed read is a failed page, never the wrong way.
  const pathFailure = (unlockRead && unlock.isError ? unlock : null) ?? (masterDataQuery.isError ? masterDataQuery : null) ?? (isMarried && linkQuery.isError ? linkQuery : null)
  if (pathFailure !== null) {
    return (
      <ErrorState
        bp={bp}
        heading={tr('abgabe.loadError.heading')}
        message={failureMessage(pathFailure.error, { offline: tr('abgabe.loadError.message') })}
        retryLabel={tr('abgabe.loadError.retry')}
        onRetry={() => void pathFailure.refetch()}
      />
    )
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
    isMarried && linkQuery.data?.data.filingType === 'zusammen'
  const isRunningYear = isRunningTaxYear(taxYear)
  // The filing type is recorded with the partner (Kopplung): the comparison is an extra, never a gate.
  const canOpenPrintout = !isRunningYear && step1Passed

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

      {isRunningYear ? (
        // K2: the running year has no official forms yet — say so before the user works through it.
        <View style={styles.runningYearNotice} testID="abgabe-laufendes-jahr">
          <Text style={styles.runningYearText}>{tr('cockpit.laufendesJahr', { jahr: taxYear, abgabeAb: taxYear + 1 })}</Text>
        </View>
      ) : null}

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

      {step1Passed && isJointFiling ? (
        <Card variant="default" style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>{tr('abgabe.schrittVergleich')}</Text>
          <Text style={styles.filingTypeText} testID="abgabe-veranlagungsart">{tr('abgabe.zusammenErfasst')}</Text>
          {comparisonOpen ? (
            <View testID="abgabe-vergleich-abschnitt">
              <FilingTypeComparisonScreen embedded marriedKnown taxYear={taxYear} />
              <Button variant="leise" onPress={() => setComparisonOpen(false)} style={styles.skipBtn} testID="abgabe-vergleich-schliessen">
                {tr('abgabe.vergleichSchliessen')}
              </Button>
            </View>
          ) : (
            <Button variant="ghost" onPress={() => setComparisonOpen(true)} style={styles.skipBtn} testID="abgabe-vergleich-oeffnen">
              {tr('abgabe.vergleichOeffnen')}
            </Button>
          )}
        </Card>
      ) : null}

      {viaElster ? (
        <>
          <Text style={styles.elsterHint} testID="abgabe-elster-hinweis">
            {tr('abgabe.elsterHinweis')}
          </Text>
          <Button onPress={() => onOpenElsterHelp(taxYear)} disabled={!canOpenPrintout} style={styles.printBtn} testID="abgabe-zur-ausfuellhilfe">
            {tr('abgabe.zurAusfuellhilfe')}
          </Button>
        </>
      ) : (
        <Button onPress={() => onOpenPrintout(taxYear)} disabled={!canOpenPrintout} style={styles.printBtn} testID="abgabe-zum-ausdruck">
          {tr('abgabe.zumAusdruck')}
        </Button>
      )}
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
  const screen: ViewStyle = t.layout.flow.narrow
  const wideScreen: ViewStyle = t.layout.flow.wide
  const headerRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', marginBottom: t.space.s4 }
  const heading: TextStyle = {
    ...t.type.title,
    color: t.color.tinte,
    marginBottom: t.space.s4,
  }
  const sectionCard: ViewStyle = {
    marginBottom: t.space.s4,
    borderWidth: t.space.kontur,
    borderColor: t.color.linieWeich,
  }
  const sectionTitle: TextStyle = {
    ...t.type.cardTitle,
    color: t.color.tinte,
    marginBottom: t.space.s2,
  }
  const okText: TextStyle = { ...t.type.body, color: t.color.ok }
  const filingTypeText: TextStyle = { ...t.type.body, color: t.color.tinte }
  const findingBlock: ViewStyle = { marginTop: t.space.s2, gap: t.space.s2 }
  const findingHeading: TextStyle = {
    ...t.type.label,
    color: t.color.tinte,
  }
  const findingRow: ViewStyle = { gap: t.space.s2, marginBottom: t.space.s2 }
  const blockerText: TextStyle = { ...t.type.small, color: t.color.fehler }
  const noticeText: TextStyle = { ...t.type.small, color: t.color.warn }
  const tileLinkBtn: ViewStyle = { alignSelf: 'flex-start' }
  const confirmBtn: ViewStyle = { marginTop: t.space.s3 }
  const skipBtn: ViewStyle = { marginTop: t.space.s3 }
  const printBtn: ViewStyle = { marginTop: t.space.s2 }
  const elsterHint: TextStyle = { ...t.type.small, color: t.color.tinte2, marginTop: t.space.s3 }
  const runningYearNotice: ViewStyle = {
    borderWidth: 1,
    borderColor: t.color.tinte2,
    paddingHorizontal: t.space.s3,
    paddingVertical: t.space.s2,
    marginBottom: t.space.s4,
  }
  const runningYearText: TextStyle = { ...t.type.small, color: t.color.tinte }

  return {
    runningYearNotice,
    runningYearText,
    screen,
    wideScreen,
    headerRow,
    heading,
    sectionCard,
    sectionTitle,
    okText,
    filingTypeText,
    findingBlock,
    findingHeading,
    findingRow,
    blockerText,
    noticeText,
    tileLinkBtn,
    confirmBtn,
    skipBtn,
    printBtn,
    elsterHint,
  }
}
