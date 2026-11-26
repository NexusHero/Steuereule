import { ActivityIndicator, View, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Chip, useTheme } from '@steuereule/ui'
import type { Answers } from '@steuereule/core'
import { DeadlinesBanner } from '../deadlines/DeadlinesBanner'
import { APP_NS } from '../../i18n/resources'
import { isRunningTaxYear, selectableTaxYears, useTaxYearClock } from '../../config/taxYear'
import { makeStyles } from './CockpitScreen.styles'
import type { Progress } from './cockpitTypes'

export function Appbar({ year, onYearChange, isRefreshing }: { readonly year: number; readonly onYearChange: (selectedYear: number) => void; readonly isRefreshing: boolean }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  // OPS-16: the years follow the server's clock; the chips re-render when its answer arrives.
  useTaxYearClock()
  return (
    <View style={styles.appbar}>
      <View style={styles.appbarTitleReihe}>
        <Text style={styles.appbarTitle}>{tr('cockpit.appbarTitle')}</Text>
        {isRefreshing ? <ActivityIndicator size="small" color={t.color.tinte2} accessibilityLabel={tr('cockpit.refreshing')} /> : null}
      </View>
      {/* Under the title, across the full width: the years wrap into two lines at 375 px instead of five, and none is cut off. */}
      <View style={styles.jahrReihe} accessibilityLabel={tr('cockpit.jahrAuswahl')}>
        {selectableTaxYears().map((y) => (
          <Chip key={y} active={y === year} onPress={() => onYearChange(y)} testID={`jahr-${y}`}>
            {isRunningTaxYear(y) ? tr('cockpit.jahrLaeuft', { jahr: y }) : String(y)}
          </Chip>
        ))}
      </View>
    </View>
  )
}

/** The notices about the year itself: the running year's prepare mode (K2) and the deadline (H5). */
export function YearNotices({ year, answers }: { readonly year: number; readonly answers: Answers | null }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  return (
    <>
      {isRunningTaxYear(year) ? (
        <View style={styles.runningYearNotice} testID="cockpit-laufendes-jahr">
          <Text style={styles.runningYearText}>{tr('cockpit.laufendesJahr', { jahr: year, abgabeAb: year + 1 })}</Text>
        </View>
      ) : null}
      <DeadlinesBanner taxYear={year} answers={answers} />
    </>
  )
}

/** „3 von 6 Schritten erledigt“ with one segment per step: where the user stands, in one line. */
export function ProgressLine({ progress }: { readonly progress: Progress | null }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  if (progress === null || progress.total === 0) return null
  const label = tr('cockpit.fortschritt', { erledigt: progress.done, count: progress.total })
  return (
    <View
      style={styles.progress}
      accessibilityRole="progressbar"
      // A progress bar without a name is announced as a bare number (WCAG 4.1.2): it carries the sentence itself.
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: progress.total, now: progress.done }}
      testID="cockpit-fortschritt"
    >
      <View style={styles.progressBar}>
        {Array.from({ length: progress.total }, (_, index) => (
          <View key={index} style={index < progress.done ? styles.progressSegmentDone : styles.progressSegment} />
        ))}
      </View>
      <Text style={styles.progressText} testID="cockpit-fortschritt-text">
        {label}
      </Text>
    </View>
  )
}
