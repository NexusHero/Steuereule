// The head of the open preview: heading, row summary, the view switch and the collapse button.
import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Chip, useTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { makeStyles } from './GlassFormPreviewStyles'

export function GlassFormPreviewHeader({
  hideHeading,
  sectionCount,
  totalRows,
  viewMode,
  onChangeViewMode,
  onCollapse,
}: {
  readonly hideHeading: boolean
  readonly sectionCount: number
  readonly totalRows: number
  readonly viewMode: 'zeilen' | 'acroform'
  readonly onChangeViewMode: (mode: 'zeilen' | 'acroform') => void
  readonly onCollapse?: (() => void) | undefined
}) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)

  return (
    <View style={styles.headerRow}>
      <View style={styles.titleColumn}>
        {hideHeading ? null : (
          <Text style={styles.heading}>
            {tr('ausdruck.glasErklaerung.titel', 'Glas-Erklärung: Amtliche Formular-Vorschau')}
          </Text>
        )}
        <Text style={styles.subheading}>
          {totalRows > 0
            ? `${sectionCount} Vordrucke · ${totalRows} befüllte Formularzeilen · Tipp auf eine Zeile öffnet die Eingabemaske`
            : tr(
                'ausdruck.glasErklaerung.leer',
                'Noch keine Formularzeilen befüllt. Sobald du Angaben im Strom, in den Masken oder über die Eule machst, erscheinen sie hier.',
              )}
        </Text>
      </View>
      <View style={styles.filterRow}>
        <Chip active={viewMode === 'zeilen'} onPress={() => onChangeViewMode('zeilen')}>
          📋 Strukturierte Zeilen
        </Chip>
        <Chip active={viewMode === 'acroform'} onPress={() => onChangeViewMode('acroform')}>
          📄 Original-Vordruck
        </Chip>
        {onCollapse ? (
          <Pressable
            accessibilityRole="button"
            onPress={onCollapse}
            style={styles.toggleButton}
            testID="glass-form-preview-collapse"
          >
            <Text style={styles.toggleButtonText}>
              {tr('ausdruck.glasErklaerung.schliessen', 'Einklappen ▲')}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}
