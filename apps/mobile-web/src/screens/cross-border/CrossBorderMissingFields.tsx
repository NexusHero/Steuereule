import { View, Text, Pressable } from 'react-native'
import { Card, useTheme } from '@steuereule/ui'
import { makeStyles } from './CrossBorderScreen.styles'

export interface RequiredField {
  readonly id: string
  readonly label: string
  readonly open: boolean
}

/** The banner naming the required fields still open; the drawer state lives with the mask. */
export function CrossBorderMissingFields({
  openRequiredFields,
  drawerOpen,
  onToggleDrawer,
}: {
  readonly openRequiredFields: ReadonlyArray<RequiredField>
  readonly drawerOpen: boolean
  readonly onToggleDrawer: () => void
}) {
  const t = useTheme()
  const styles = makeStyles(t)
  return (
    <Card style={styles.missingFieldsCard} testID="ch-offene-pflichtfelder-banner">
      <Pressable
        accessibilityRole="button"
        onPress={onToggleDrawer}
        style={styles.missingHeaderRow}
        testID="ch-offene-pflichtfelder-toggle"
      >
        <Text style={styles.missingBadgeText}>
          {`! ${openRequiredFields.length} ${openRequiredFields.length === 1 ? 'Pflichtangabe fehlt noch' : 'Pflichtangaben fehlen noch'}`}
        </Text>
        <Text style={styles.missingChipText}>{drawerOpen ? 'Ausblenden ▲' : 'Welche fehlen? ▼'}</Text>
      </Pressable>
      {drawerOpen ? (
        <View style={styles.missingChipsRow}>
          {openRequiredFields.map((item) => (
            <View key={item.id} style={styles.missingChip} testID={`ch-offen-chip-${item.id}`}>
              <Text style={styles.missingChipText}>{item.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  )
}
