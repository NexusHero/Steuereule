import { Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Card, Pill, useTheme } from '@steuereule/ui'
import { formatEuro } from '@steuereule/core'
import type { ChSalaryCertificateResponseDto } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { makeStyles } from './CrossBorderScreen.styles'

/** The server-derived Grenzgänger status and the fold into the return (Einnahmen, Vorsorge, Anrechnung). */
export function CrossBorderStatusCards({
  status,
  foldStatus,
}: {
  readonly status: ChSalaryCertificateResponseDto['status']
  readonly foldStatus: ChSalaryCertificateResponseDto['foldStatus']
}) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  return (
    <>
      {status !== null ? (
        <Card variant="default" style={styles.statusCard}>
          <Text style={styles.sectionTitle}>{tr('grenzgaenger.lohnausweis.status.label')}</Text>
          <Pill>{status === 'echter-grenzgaenger' ? tr('grenzgaenger.lohnausweis.status.echterGrenzgaenger') : tr('grenzgaenger.lohnausweis.status.keinGrenzgaenger')}</Pill>
        </Card>
      ) : (
        <Text style={styles.help}>{tr('grenzgaenger.lohnausweis.status.offen')}</Text>
      )}

      {foldStatus !== null ? (
        <Card variant="default" style={styles.statusCard}>
          <Text style={styles.sectionTitle}>{tr('grenzgaenger.lohnausweis.stand.label')}</Text>
          <Text style={styles.standRow}>
            {tr('grenzgaenger.lohnausweis.stand.einnahmen')}: {formatEuro(foldStatus.einnahmen)}
          </Text>
          <Text style={styles.standRow}>
            {tr('grenzgaenger.lohnausweis.stand.vorsorgeaufwand')}: {formatEuro(foldStatus.vorsorgeaufwand)}
          </Text>
          <Text style={styles.standRow}>
            {tr('grenzgaenger.lohnausweis.stand.anrechnung')}: {formatEuro(foldStatus.anrechnung)}
          </Text>
          {foldStatus.kind === 'offen' && foldStatus.openItems !== undefined ? (
            <Text style={styles.help}>{tr('grenzgaenger.lohnausweis.stand.offen', { count: foldStatus.openItems })}</Text>
          ) : null}
        </Card>
      ) : null}
    </>
  )
}
