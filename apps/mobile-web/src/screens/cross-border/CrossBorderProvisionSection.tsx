import { Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@steuereule/ui'
import type { ChSalaryCertificateResponseDto, NGreDetailsDto, PutNGreDto, PutProvisionDto } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { makeStyles } from './CrossBorderScreen.styles'
import { NGreInput } from './NGreInput'

export function ProvisionSection({
  salaryCertificate,
  nGre,
  onSet,
  onSetNGre,
}: {
  readonly salaryCertificate: ChSalaryCertificateResponseDto
  readonly nGre: NGreDetailsDto
  readonly onSet: (data: PutProvisionDto) => void
  readonly onSetNGre: (data: PutNGreDto) => void
}) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const saved = (kind: string) => salaryCertificate.items.find((p) => p.kind === kind)?.amountChf
  return (
    <>
      <Text style={styles.sectionTitle}>{tr('grenzgaenger.vorsorge.title')}</Text>
      <Text style={styles.help}>{tr('grenzgaenger.vorsorge.help')}</Text>
      {(
        [
          ['krankenkasseChf', 'Krankenkasse'],
          ['saeule3aChf', 'Saeule3a'],
        ] as const
      ).map(([field, kind]) => {
        const initial = saved(kind)
        return (
          <NGreInput
            key={field}
            label={tr(`grenzgaenger.vorsorge.${field}`)}
            initial={initial === undefined ? '' : String(initial)}
            numeric
            testID={`ch-vorsorge-${field}`}
            onCommit={(text) => {
              if (text === '') onSet({ [field]: null })
              else onSet({ [field]: Number(text) })
            }}
          />
        )
      })}
      {/* Supplementary insurance (VVG) is stored with the N-Gre details, not with the provision items. */}
      <NGreInput
        label={tr('grenzgaenger.vorsorge.krankenkasseZusatzChf')}
        initial={nGre.krankenkasseZusatzChf === null ? '' : String(nGre.krankenkasseZusatzChf)}
        numeric
        testID="ch-vorsorge-krankenkasseZusatzChf"
        onCommit={(text) => {
          if (text === '') onSetNGre({ krankenkasseZusatzChf: null })
          else onSetNGre({ krankenkasseZusatzChf: Number(text) })
        }}
      />
      <Text style={styles.help}>{tr('grenzgaenger.vorsorge.krankenkasseZusatzHilfe')}</Text>
    </>
  )
}
