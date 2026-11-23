import { Linking, Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Card } from '@steuereule/ui'
import type { AdvisorLegalSource } from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'
import type { makeStyles } from './AdvisorChatPanel.styles'

interface AdvisorChatLawSourceProps {
  readonly source: AdvisorLegalSource
  readonly onClose: () => void
  readonly styles: ReturnType<typeof makeStyles>
}

/** Interactive law source popover: paragraph, summary, legal status and the official text. */
export function AdvisorChatLawSource({ source, onClose, styles }: AdvisorChatLawSourceProps) {
  const { t: tr } = useTranslation(APP_NS)
  return (
    <Card style={styles.lawModal} testID="law-source-modal">
      <View style={styles.lawModalHeader}>
        <View>
          <Text style={styles.lawModalParagraph}>{source.paragraph}</Text>
          <Text style={styles.lawModalTitle}>{source.title}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr('advisor.chat.legalSourceCloseAria', 'Rechtsquelle schließen')}
          onPress={onClose}
          style={styles.lawModalCloseBtn}
          testID="law-source-close"
        >
          <Text style={styles.lawModalCloseText}>{tr('advisor.chat.legalSourceClose', '✕ Schließen')}</Text>
        </Pressable>
      </View>
      <Text style={styles.lawModalSummary}>{source.summary}</Text>
      <View style={styles.lawModalFooter}>
        <Text style={styles.lawModalDate}>
          {tr('advisor.chat.legalStatus', {
            date: source.legalStatusDate,
            defaultValue: `Rechtsstand: ${source.legalStatusDate}`,
          })}
        </Text>
        <Pressable
          accessibilityRole="link"
          onPress={() => void Linking.openURL(source.url)}
        >
          <Text style={styles.lawModalLink}>{tr('advisor.chat.officialLawLink', 'Offizieller Gesetzestext ↗')}</Text>
        </Pressable>
      </View>
    </Card>
  )
}
