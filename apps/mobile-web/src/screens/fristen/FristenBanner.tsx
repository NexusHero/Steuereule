// Fristen-Banner (REQ-027, ticket 10.7) — der Warnmodus als Banner, NIE als Status (ADR-0039):
// die verpasste Abgabefrist bleibt `entwurf` + Banner; es gibt keinen `verspätet`-Zustand. Der
// Ton ist nüchtern (Produkt-ADR-023: Fristen sind kritisch — was ist passiert, was tun, keine
// Pointe, nie Schuld beim Nutzer). Alle Fakten kommen vom Server (GET .../fristen) — der Kern
// entscheidet, was wahr ist; die Client-Uhr spielt keine Rolle.
//
// `stufe: 'keine'` rendert nichts — der Warnmodus ist eine ehrliche Abwesenheit, kein Dauer-Banner.
import { Text, View, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme, type UiTheme } from '@steuereule/ui'
import { formatEuro } from '@steuereule/core'
import { useFristenControllerGetFristen, type FristenResponseDto } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { CURRENT_TAX_YEAR } from '../../config/taxYear'

/** 'yyyy-mm-dd' → '31.07.2027' (display-only, deterministic — the wire stays ISO). */
function formatDatum(iso: string): string {
  const [jahr, monat, tag] = iso.split('-')
  return `${tag}.${monat}.${jahr}`
}

export interface FristenBannerProps {
  readonly taxYear?: number
}

export function FristenBanner({ taxYear = CURRENT_TAX_YEAR }: FristenBannerProps) {
  const query = useFristenControllerGetFristen(taxYear)

  // Loading/error → nothing: a banner that flickers or lies is worse than no banner (ADR-0032);
  // the frist is a comfort feature, never a gate.
  if (query.isPending || query.isError || query.data.status !== 200) return null
  const dto: FristenResponseDto = query.data.data
  if (dto.stufe === 'keine') return null

  return <Banner dto={dto} />
}

/** Das Banner selbst — nüchtern, präzise, mit Betrags-/Frist-Angabe (Produkt-ADR-023). */
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
