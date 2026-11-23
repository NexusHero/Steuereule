// One child in the list: name, the key figures, and what the printout still lacks.
import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Card } from '@steuereule/ui'
import { formatEuro } from '@steuereule/core'
import { isoToGerman } from '../master-data/masterDataMapping'
import { APP_NS } from '../../i18n/resources'
import { type makeStyles } from './ChildrenScreen.styles'
import { GAP_LABEL, missingForPrintout, type ChildItem } from './childrenModel'
import { differentialChildBenefit, statutoryChildBenefit, totalChildBenefitClaim } from './childrenDerive'

export interface ChildCardProps {
  readonly k: ChildItem
  readonly index: number
  readonly taxYear: number
  readonly styles: ReturnType<typeof makeStyles>
  readonly onEdit: () => void
  readonly onDelete: () => void
}

export function ChildCard({ k, index, taxYear, styles, onEdit, onDelete }: ChildCardProps) {
  const { t: tr } = useTranslation(APP_NS)
  return (
    <Card style={styles.kindCard}>
      <View style={styles.kindHeader}>
        <Text style={styles.kindName}>
          {`${index + 1}. ${k.firstName} ${k.lastName}`}
        </Text>
        <View style={styles.kindActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Kind ${k.firstName} bearbeiten`}
            onPress={onEdit}
          >
            <Text style={styles.editButton}>{tr('kinder.edit', 'Bearbeiten')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Kind ${k.firstName} löschen`}
            onPress={onDelete}
          >
            <Text style={styles.deleteButton}>{tr('kinder.delete', 'Löschen')}</Text>
          </Pressable>
        </View>
      </View>
      <Text style={styles.kindDetail}>Geburtsdatum: {isoToGerman(k.geburtsdatum) || k.geburtsdatum}</Text>
      {k.taxId && <Text style={styles.kindDetail}>Steuer-ID: {k.taxId}</Text>}
      {k.swissFamilyAllowanceEur && Number(k.swissFamilyAllowanceEur) > 0 ? (
        <>
          <Text style={styles.kindDetail}>
            {`Schweizer Kinderzulage: ${formatEuro(Number(k.swissFamilyAllowanceEur))}`}
          </Text>
          <Text style={styles.kindDetail}>
            {`Differenz-Kindergeld: ${formatEuro(differentialChildBenefit(k, taxYear))}`}
          </Text>
          <Text style={styles.kindDetail}>
            {`Gesamtanspruch (Anlage Kind Z. 6): ${formatEuro(totalChildBenefitClaim(k, taxYear))}`}
          </Text>
        </>
      ) : (
        <Text style={styles.kindDetail}>
          Kindergeld:{' '}
          {k.childBenefitClaimEur
            ? `${k.childBenefitClaimEur} €`
            : `${formatEuro(statutoryChildBenefit(k.geburtsdatum, taxYear))} (gesetzlich)`}
        </Text>
      )}
      {missingForPrintout(k).length > 0 ? (
        <Text style={styles.luecke} testID={`kind-luecke-${k.id}`}>
          {tr('kinder.luecke', {
            defaultValue: 'Für den Ausdruck fehlen noch Angaben ({{felder}}).',
            felder: missingForPrintout(k)
              .map((gap) => tr(`kinder.lueckeFeld.${gap}`, { defaultValue: GAP_LABEL[gap] }))
              .join(', '),
          })}
        </Text>
      ) : null}
    </Card>
  )
}
