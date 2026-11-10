import { Text, View, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { inkOnFunke, useTheme, type UiTheme } from '@steuereule/ui'
import { formatEuro } from '@steuereule/core'
import { useDeadlinesControllerGetDeadlines, type DeadlinesResponseDto } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'

function formatDate(iso: string): string {
  const [year, month, tag] = iso.split('-')
  return `${tag}.${month}.${year}`
}

export interface DeadlinesBannerProps {
  readonly taxYear?: number
}

export function DeadlinesBanner({ taxYear = CURRENT_TAX_YEAR }: DeadlinesBannerProps) {
  const query = useDeadlinesControllerGetDeadlines(taxYear)

  if (query.isPending || query.isError || query.data.status !== 200) return null
  const dto: DeadlinesResponseDto = query.data.data
  if (dto.level === 'keine') return null

  return <Banner dto={dto} />
}

export function Banner({ dto }: { readonly dto: DeadlinesResponseDto }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const frist = formatDate(dto.filingDeadline)
  const minimumRate = formatEuro(dto.lateFilingSurcharge.minimumRateEur)

  if (dto.level === 'abgelaufen') {
    return (
      <View style={styles.banner} testID="fristen-banner-abgelaufen" accessibilityRole="alert">
        <Text style={styles.text}>{tr('fristen.abgelaufen', { frist, tage: -dto.remainingDays, mindestsatz: minimumRate })}</Text>
      </View>
    )
  }
  return (
    <View style={styles.banner} testID="fristen-banner-warnung">
      <Text style={styles.text}>{tr('fristen.warnung', { frist, tage: dto.remainingDays, mindestsatz: minimumRate })}</Text>
    </View>
  )
}

function makeStyles(t: UiTheme) {
  const banner: ViewStyle = {
    borderWidth: 2,
    borderColor: t.color.tinte,
    backgroundColor: t.color.funke,
    paddingHorizontal: t.space.s3,
    paddingVertical: t.space.s2,
    marginBottom: t.space.s3,
  }
  const text: TextStyle = { color: inkOnFunke(t), fontFamily: t.font.text, fontSize: t.size.s }
  return { banner, text }
}
