import { Text, View, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme, type UiTheme } from '@steuereule/ui'
import { formatEuro } from '@steuereule/core'
import { useFristenControllerGetFristen, type FristenResponseDto } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'

function formatDatum(iso: string): string {
  const [jahr, monat, tag] = iso.split('-')
  return `${tag}.${monat}.${jahr}`
}

export interface FristenBannerProps {
  readonly taxYear?: number
}

export function FristenBanner({ taxYear = CURRENT_TAX_YEAR }: FristenBannerProps) {
  const query = useFristenControllerGetFristen(taxYear)

  if (query.isPending || query.isError || query.data.status !== 200) return null
  const dto: FristenResponseDto = query.data.data
  if (dto.stufe === 'keine') return null

  return <Banner dto={dto} />
}

export function Banner({ dto }: { readonly dto: FristenResponseDto }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const frist = formatDatum(dto.abgabefrist)
  const mindestsatz = formatEuro(dto.verspaetungszuschlag.mindestsatzEur)

  if (dto.stufe === 'abgelaufen') {
    return (
      <View style={styles.banner} testID="fristen-banner-abgelaufen" accessibilityRole="alert">
        <Text style={styles.text}>{tr('fristen.abgelaufen', { frist, tage: -dto.verbleibendeTage, mindestsatz })}</Text>
      </View>
    )
  }
  return (
    <View style={styles.banner} testID="fristen-banner-warnung">
      <Text style={styles.text}>{tr('fristen.warnung', { frist, tage: dto.verbleibendeTage, mindestsatz })}</Text>
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
  const text: TextStyle = { color: t.color.tinte, fontFamily: t.font.text, fontSize: t.size.s }
  return { banner, text }
}
