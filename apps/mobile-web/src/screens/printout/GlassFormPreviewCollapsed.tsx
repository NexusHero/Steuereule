// The closed preview: title, what it shows, and the button that opens it.
import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Card, useTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { makeStyles } from './GlassFormPreviewStyles'

export function GlassFormPreviewCollapsed({ onOpen }: { readonly onOpen: () => void }) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)

  return (
    <Card style={styles.collapsedCard} testID="glass-form-preview-collapsed">
      <View style={styles.collapsedHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.collapsedTitle}>
            {tr('ausdruck.glasErklaerung.titel', 'Glas-Erklärung: Amtliche Formular-Vorschau')}
          </Text>
          <Text style={styles.collapsedSubtitle}>
            {tr(
              'ausdruck.glasErklaerung.untertitel',
              'Sieh live, in welchem amtlichen Vordruck und welcher Zeile deine Angaben landen – inklusive Herkunft und Direktsprung in die Maske.',
            )}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onOpen}
          style={styles.toggleButton}
          testID="glass-form-preview-toggle"
        >
          <Text style={styles.toggleButtonText}>
            {tr('ausdruck.glasErklaerung.oeffnen', 'Formularzeilen ansehen ▼')}
          </Text>
        </Pressable>
      </View>
    </Card>
  )
}
