// The tax relief all children bring together.
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Card } from '@steuereule/ui'
import { formatEuro, type calculateChildrenStatus } from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'
import { type makeStyles } from './ChildrenScreen.styles'

export interface ChildrenSummaryCardProps {
  readonly styles: ReturnType<typeof makeStyles>
  readonly foldStatus: ReturnType<typeof calculateChildrenStatus>
}

export function ChildrenSummaryCard({ styles, foldStatus }: ChildrenSummaryCardProps) {
  const { t: tr } = useTranslation(APP_NS)
  return (
    <Card style={styles.summaryCard}>
      <Text style={styles.summaryTitle}>{tr('kinder.summaryTitle', 'Steuerliche Entlastung')}</Text>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>{tr('kinder.freibetragLabel', 'Kinderfreibetrag Gesamt:')}</Text>
        <Text style={styles.summaryValue}>{formatEuro(foldStatus.totalAllowance)}</Text>
      </View>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>{tr('kinder.kindergeldLabel', 'Kindergeld Anspruch:')}</Text>
        <Text style={styles.summaryValue}>{formatEuro(foldStatus.childBenefitSum)}</Text>
      </View>
      {foldStatus.swissFamilyAllowanceSum > 0 ? (
        <>
          <View style={styles.summaryRow}>
            <Text style={styles.summarySubLabel}>{tr('kinder.schweizLabel', 'davon Schweizer Kinderzulage:')}</Text>
            <Text style={styles.summarySubValue}>{formatEuro(foldStatus.swissFamilyAllowanceSum)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summarySubLabel}>{tr('kinder.diffLabel', 'davon Differenz-Kindergeld (DE):')}</Text>
            <Text style={styles.summarySubValue}>{formatEuro(foldStatus.differentialChildBenefitSum)}</Text>
          </View>
        </>
      ) : null}
    </Card>
  )
}
