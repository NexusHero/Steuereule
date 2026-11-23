// The filter chips: every section, or one Vordruck.
import { View } from 'react-native'
import { Chip, useTheme } from '@steuereule/ui'
import { makeStyles } from './GlassFormPreviewStyles'
import type { GlassFormSection } from './glassFormTypes'

export function GlassFormPreviewFilterRow({
  sections,
  totalRows,
  activeFilter,
  onSelectFilter,
}: {
  readonly sections: readonly GlassFormSection[]
  readonly totalRows: number
  readonly activeFilter: string
  readonly onSelectFilter: (filter: string) => void
}) {
  const t = useTheme()
  const styles = makeStyles(t)

  return (
    <View style={styles.filterRow} testID="glass-form-filter-row">
      <Chip
        active={activeFilter === 'alle'}
        onPress={() => onSelectFilter('alle')}
        testID="glass-filter-alle"
      >
        {`Alle (${totalRows})`}
      </Chip>
      {sections.map((sec) => (
        <Chip
          key={sec.formId}
          active={activeFilter === sec.formId}
          onPress={() => onSelectFilter(sec.formId)}
          testID={`glass-filter-${sec.formId}`}
        >
          {`${sec.title} (${sec.rows.length})`}
        </Chip>
      ))}
    </View>
  )
}
