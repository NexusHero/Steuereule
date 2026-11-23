// One Vordruck of the structured preview: its rows, each with Zeile, person, provenance and value.
import { Pressable, Text, View } from 'react-native'
import { Card, useTheme } from '@steuereule/ui'
import type { Screen } from '@steuereule/core'
import { makeStyles } from './GlassFormPreviewStyles'
import type { GlassFormSection } from './glassFormTypes'

export function GlassFormPreviewSectionCard({
  section,
  partnerName,
  onInspectField,
}: {
  readonly section: GlassFormSection
  readonly partnerName: string
  readonly onInspectField?: ((screen: Screen, field?: string, person?: 'A' | 'B') => void) | undefined
}) {
  const t = useTheme()
  const styles = makeStyles(t)

  return (
    <Card style={styles.sectionCard} testID={`glass-section-${section.formId}`}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{section.title}</Text>
        <Text style={styles.sectionCount}>{`${section.rows.length} Zeilen`}</Text>
      </View>
      <Text style={styles.sectionSubtitle}>{section.subtitle}</Text>

      <View style={styles.rowList}>
        {section.rows.map((row) => (
          <Pressable
            key={row.id}
            accessibilityRole={onInspectField ? 'button' : 'text'}
            disabled={!onInspectField}
            onPress={
              onInspectField
                ? () => onInspectField(row.screen, row.field, row.person === 'B' ? 'B' : 'A')
                : undefined
            }
            style={styles.rowItem}
            testID={`glass-row-${row.id}`}
          >
            <View style={styles.rowTop}>
              <View style={styles.linePill}>
                <Text style={styles.linePillText}>{row.line}</Text>
              </View>
              {row.person === 'B' ? (
                <View style={styles.personPill}>
                  <Text style={styles.personPillText}>{partnerName}</Text>
                </View>
              ) : row.person === 'gemeinsam' ? (
                <View style={styles.personPill}>
                  <Text style={styles.personPillText}>Gemeinsam</Text>
                </View>
              ) : null}
              <Text style={styles.provenanceBadge}>{row.provenanceLabel}</Text>
            </View>
            <View style={styles.rowMain}>
              <Text style={styles.rowLabel}>{row.label}</Text>
              <Text style={styles.rowValue}>{row.value}</Text>
            </View>
            {onInspectField ? (
              <Text style={styles.jumpHint}>Zur Eingabemaske springen →</Text>
            ) : null}
          </Pressable>
        ))}
      </View>
    </Card>
  )
}
