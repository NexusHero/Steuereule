import { View, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Input, Feld, useTheme } from '@steuereule/ui'
import { SALARY_CERTIFICATE_SIGNED_FIELD } from '@steuereule/core'
import type { PutSalaryCertificateFieldDto } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { makeStyles } from './CrossBorderScreen.styles'
import { salaryAmountFrom } from './salaryCertificateAmounts'

export function ChFieldInput({
  fieldId,
  digit,
  required = false,
  value,
  initial,
  onChangeText,
  onCommit,
}: {
  readonly fieldId: string
  readonly digit: string
  readonly required?: boolean
  readonly value: string
  readonly initial: string
  readonly onChangeText: (text: string) => void
  readonly onCommit: (value: PutSalaryCertificateFieldDto) => void
}) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  function commit() {
    const trimmed = value.trim()
    if (trimmed === initial) return
    if (trimmed === '') return onCommit({ kind: 'offen' })
    const parsed = salaryAmountFrom(trimmed, fieldId)
    if (parsed !== null) onCommit({ kind: 'erfasst', value: parsed })
  }
  const label = `${tr('grenzgaenger.lohnausweis.ziffer', { n: digit })} · ${tr(`grenzgaenger.lohnausweis.felder.${fieldId}`)}`
  return (
    <View style={required ? styles.requiredFieldWrapper : undefined}>
      {required ? (
        <View style={styles.requiredBadgeRow} testID={`ch-pflicht-${fieldId}`}>
          <Text style={styles.requiredBadgeText}>Pflichtfeld</Text>
        </View>
      ) : null}
      <Feld label={label}>
        <Input
          // Ziffer 7 may be negative: the number pad has no minus sign.
          type={fieldId === SALARY_CERTIFICATE_SIGNED_FIELD ? 'text' : 'numeric'}
          accessibilityLabel={label}
          value={value}
          onChange={onChangeText}
          placeholder="0"
          mono
          onSubmit={commit}
          onBlur={commit}
          testID={`ch-feld-${fieldId}`}
        />
      </Feld>
    </View>
  )
}
