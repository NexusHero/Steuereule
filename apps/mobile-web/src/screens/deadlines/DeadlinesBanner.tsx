import { Text, View, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme, type UiTheme } from '@steuereule/ui'
import { Icon } from '../../icons/Icon'
import {
  filingObligation,
  formatEuro,
  isLateFilingSurchargeMandatory,
  mandatoryLateFilingSurchargeFrom,
  voluntaryFilingDeadlineFor,
  type Answers,
} from '@steuereule/core'
import { useDeadlinesControllerGetDeadlines, type DeadlinesResponseDto } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { runningTaxYear } from '../../config/taxYear'
import { InlineLoadFailure } from '../shared/InlineLoadFailure'
import { CalendarEntryButton } from '../shared/CalendarEntryButton'

function formatDate(iso: string): string {
  const [year, month, tag] = iso.split('-')
  return `${tag}.${month}.${year}`
}

export interface DeadlinesBannerProps {
  readonly taxYear?: number
  /** The interview answers of the year; `null` while they are not known yet (renders nothing). */
  readonly answers: Answers | null
}

export function DeadlinesBanner({ taxYear = runningTaxYear(), answers }: DeadlinesBannerProps) {
  const query = useDeadlinesControllerGetDeadlines(taxYear)
  const { t: tr } = useTranslation(APP_NS)

  if (answers === null) return null
  if (query.isPending) return null
  // A deadline that did not load is said, never an empty space where a warning would be.
  if (query.isError) {
    return <InlineLoadFailure what={tr('fristen.ladefehler')} error={query.error} onRetry={() => void query.refetch()} testID="fristen-ladefehler" />
  }
  const dto: DeadlinesResponseDto = query.data.data
  if (dto.level === 'keine') return null

  return <Banner dto={dto} taxYear={taxYear} answers={answers} />
}

type BannerVariant = 'warnung' | 'abgelaufen' | 'zuschlag' | 'freiwillig' | 'unklar'

/**
 * Only a mandatory return (Pflichtveranlagung) has a deadline that can cost money; before the
 * 14-month mark of § 152 Abs. 2 AO the surcharge is the tax office's discretion.
 */
function variantFor(dto: DeadlinesResponseDto, taxYear: number, answers: Answers): BannerVariant {
  const obligation = filingObligation(answers)
  if (obligation !== 'pflicht') return obligation
  if (dto.level !== 'abgelaufen') return 'warnung'
  return isLateFilingSurchargeMandatory(taxYear, dto.today) ? 'zuschlag' : 'abgelaufen'
}

export function Banner({ dto, taxYear, answers }: { readonly dto: DeadlinesResponseDto; readonly taxYear: number; readonly answers: Answers }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const frist = formatDate(dto.filingDeadline)
  const mindestsatz = formatEuro(dto.lateFilingSurcharge.minimumRateEur)
  const pflichtAb = formatDate(mandatoryLateFilingSurchargeFrom(taxYear))
  const variant = variantFor(dto, taxYear, answers)
  // A deadline that still lies ahead can go into the user's calendar; one that passed is no appointment.
  const calendarWords = {
    abgabe: { title: tr('fristen.kalenderTitel.abgabe', { jahr: taxYear }), description: tr('fristen.kalenderText.abgabe', { jahr: taxYear }) },
    freiwillig: { title: tr('fristen.kalenderTitel.freiwillig', { jahr: taxYear }), description: tr('fristen.kalenderText.freiwillig', { jahr: taxYear }) },
  }
  const calendar = (day: string, kind: 'abgabe' | 'freiwillig') => (
    <CalendarEntryButton
      entry={{ uid: `${kind}frist-${taxYear}@steuereule`, day, ...calendarWords[kind], remindDaysBefore: [30, 7] }}
      fileName={`steuereule-${kind}frist-${taxYear}`}
      testID="fristen-kalender"
    />
  )

  switch (variant) {
    case 'freiwillig':
      return (
        <View style={styles.calmBanner} testID="fristen-banner-freiwillig">
          <Text style={styles.calmText}>{tr('fristen.freiwillig', { bis: formatDate(voluntaryFilingDeadlineFor(taxYear)) })}</Text>
          {voluntaryFilingDeadlineFor(taxYear) >= dto.today ? calendar(voluntaryFilingDeadlineFor(taxYear), 'freiwillig') : null}
        </View>
      )
    case 'unklar':
      // Not known yet whether a return is due: no banner and no alarm, but the date itself is said in
      // one line. Someone who turns out to be obliged must not learn the deadline after it has passed.
      return (
        <View testID="fristen-banner-unklar">
          <View style={styles.dateRow}>
            <Icon name="clock" size={16} color={t.color.tinte2} />
            <Text style={styles.dateLine}>{tr('fristen.unklar', { frist })}</Text>
          </View>
          {dto.filingDeadline >= dto.today ? calendar(dto.filingDeadline, 'abgabe') : null}
        </View>
      )
    case 'zuschlag':
      return (
        <View style={styles.banner} testID="fristen-banner-zuschlag" accessibilityRole="alert">
          <Text style={styles.text}>{tr('fristen.zuschlagPflicht', { frist, tage: -dto.remainingDays, pflichtAb, mindestsatz })}</Text>
        </View>
      )
    case 'abgelaufen':
      return (
        <View style={styles.banner} testID="fristen-banner-abgelaufen" accessibilityRole="alert">
          <Text style={styles.text}>{tr('fristen.abgelaufen', { frist, pflichtAb, mindestsatz })}</Text>
        </View>
      )
    case 'warnung':
      return (
        <View style={styles.banner} testID="fristen-banner-warnung">
          <Text style={styles.text}>{tr('fristen.warnung', { frist, tage: dto.remainingDays, mindestsatz })}</Text>
          {calendar(dto.filingDeadline, 'abgabe')}
        </View>
      )
  }
}

function makeStyles(t: UiTheme) {
  // A quiet note, not an alarm: soft lime, no contour.
  const banner: ViewStyle = {
    backgroundColor: t.color.funkeWeich,
    borderRadius: t.radius.s,
    paddingHorizontal: t.space.s3,
    paddingVertical: t.space.s2,
    marginBottom: t.space.s3,
  }
  const text: TextStyle = { ...t.type.small, color: t.color.tinte }
  const calmBanner: ViewStyle = {
    borderWidth: 1,
    borderColor: t.color.tinte2,
    paddingHorizontal: t.space.s3,
    paddingVertical: t.space.s2,
    marginBottom: t.space.s3,
  }
  const calmText: TextStyle = { ...t.type.small, color: t.color.tinte }
  const dateRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s2, marginBottom: t.space.s3 }
  const dateLine: TextStyle = { ...t.type.small, color: t.color.tinte2, flexShrink: 1 }
  return { banner, text, calmBanner, calmText, dateRow, dateLine }
}
