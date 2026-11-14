import { Text, View, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme, type UiTheme } from '@steuereule/ui'
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
import { CURRENT_TAX_YEAR } from '../../config/taxYear'

function formatDate(iso: string): string {
  const [year, month, tag] = iso.split('-')
  return `${tag}.${month}.${year}`
}

export interface DeadlinesBannerProps {
  readonly taxYear?: number
  /** The interview answers of the year; `null` while they are not known yet (renders nothing). */
  readonly answers: Answers | null
}

export function DeadlinesBanner({ taxYear = CURRENT_TAX_YEAR, answers }: DeadlinesBannerProps) {
  const query = useDeadlinesControllerGetDeadlines(taxYear)

  if (answers === null) return null
  if (query.isPending || query.isError || query.data.status !== 200) return null
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

  switch (variant) {
    case 'freiwillig':
      return (
        <View style={styles.calmBanner} testID="fristen-banner-freiwillig">
          <Text style={styles.calmText}>{tr('fristen.freiwillig', { bis: formatDate(voluntaryFilingDeadlineFor(taxYear)) })}</Text>
        </View>
      )
    case 'unklar':
      return (
        <View style={styles.calmBanner} testID="fristen-banner-unklar">
          <Text style={styles.calmText}>{tr('fristen.unklar', { frist })}</Text>
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
  return { banner, text, calmBanner, calmText }
}
