// Impressum, Datenschutzerklärung, AGB & Widerruf, Hinweise (ADR-0050) — one screen, the
// page chosen by route. Bodies come from texte.ts; operator data from the build env, so
// a missing Impressum stays visibly missing instead of showing placeholder data.
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useBreakpoint, useTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { makeDatenschutzStyles } from '../datenschutz/styles'
import { RechtlichesLinks } from './RechtlichesLinks'
import { inhalt, SEITEN_TITEL, type Betreiber, type RechtlicheSeite } from './texte'

export interface RechtlichesScreenProps {
  readonly seite: RechtlicheSeite
  readonly betreiber: Betreiber | null
  readonly onZurueck: () => void
  readonly onSeite: (seite: RechtlicheSeite) => void
}

export function RechtlichesScreen({ seite, betreiber, onZurueck, onSeite }: RechtlichesScreenProps) {
  const bp = useBreakpoint()
  const { t } = useTranslation(APP_NS)
  const theme = useTheme()
  const styles = makeDatenschutzStyles(theme)

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <View style={styles.appbar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('rechtliches.back')}
          onPress={onZurueck}
          style={styles.backButton}
        >
          <Text style={styles.backGlyph}>←</Text>
        </Pressable>
        <Text style={styles.appbarTitle} accessibilityRole="header">
          {SEITEN_TITEL[seite]}
        </Text>
      </View>

      {inhalt(seite, betreiber).map((abschnitt) => (
        <View key={abschnitt.titel} style={{ marginBottom: theme.space.s4 }}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            {abschnitt.titel}
          </Text>
          {abschnitt.absaetze.map((absatz) => (
            <Text key={absatz} style={styles.sectionBody}>
              {absatz}
            </Text>
          ))}
        </View>
      ))}

      <RechtlichesLinks aktuell={seite} onSeite={onSeite} />
    </ScrollView>
  )
}
