import { Pressable, ScrollView, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useBreakpoint, useTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { makePrivacyStyles } from '../privacy/styles'
import { LegalLinks } from './LegalLinks'
import { content, PAGE_TITLES, type Operator, type LegalPage } from './texts'

export interface LegalScreenProps {
  readonly page: LegalPage
  readonly operator: Operator | null
  readonly onBack: () => void
  readonly onPage: (page: LegalPage) => void
}

export function LegalScreen({ page, operator, onBack, onPage }: LegalScreenProps) {
  const bp = useBreakpoint()
  const { t } = useTranslation(APP_NS)
  const theme = useTheme()
  const styles = makePrivacyStyles(theme)

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <View style={styles.appbar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('rechtliches.back')}
          onPress={onBack}
          style={styles.backButton}
        >
          <Text style={styles.backGlyph}>←</Text>
        </Pressable>
        <Text style={styles.appbarTitle} accessibilityRole="header">
          {PAGE_TITLES[page]}
        </Text>
      </View>

      {content(page, operator).map((section) => (
        <View key={section.title} style={{ marginBottom: theme.space.s4 }}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            {section.title}
          </Text>
          {section.paragraphs.map((paragraph) => (
            <Text key={paragraph} style={styles.sectionBody}>
              {paragraph}
            </Text>
          ))}
        </View>
      ))}

      <LegalLinks current={page} onPage={onPage} />
    </ScrollView>
  )
}
