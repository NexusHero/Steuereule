import { ScrollView, Switch, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { Screen } from '@steuereule/core'
import { Card, useBreakpoint, useTheme, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { useExpertMode, writeExpertMode } from '../../lib/expertModePreference'
import { BackButton, BackButtonSpacer } from '../shared/BackButton'
import type { AcroFormPdfLoader } from './AcroFormLiveViewer'
import { GlassFormPreview } from './GlassFormPreview'

export interface OfficialFormScreenProps {
  readonly taxYear: number
  /** The Vordruck to open first, e.g. `anlage-n` from the Lohnsteuer mask. */
  readonly initialForm?: string | undefined
  readonly onBack?: (() => void) | undefined
  readonly onInspectField?: ((screen: Screen, field?: string, person?: 'A' | 'B') => void) | undefined
  readonly acroFormLoader?: AcroFormPdfLoader | undefined
}

/**
 * The official Vordrucke on a screen of their own (wide layout): read them, jump from a field to its
 * mask, and — with the expert mode — change values right in the form.
 */
export function OfficialFormScreen({ taxYear, initialForm, onBack, onInspectField, acroFormLoader }: OfficialFormScreenProps) {
  const t = useTheme()
  const bp = useBreakpoint()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const expertMode = useExpertMode()

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <View style={styles.headerRow}>
        {onBack ? <BackButton accessibilityLabel={tr('formular.zurueck')} onPress={onBack} /> : <BackButtonSpacer />}
      </View>
      <Text style={styles.heading} accessibilityRole="header">
        {tr('formular.titel', { jahr: taxYear })}
      </Text>
      <Text style={styles.intro}>{tr('formular.intro')}</Text>

      <Card style={styles.expertCard}>
        <View style={styles.expertRow}>
          <View style={styles.expertText}>
            <Text style={styles.expertTitle}>{tr('profil.expertenmodus.titel')}</Text>
            <Text style={styles.expertBody}>{tr(expertMode ? 'formular.expertenmodusAn' : 'formular.expertenmodusAus')}</Text>
          </View>
          <Switch
            testID="formular-expertenmodus"
            accessibilityLabel={tr('profil.expertenmodus.titel')}
            value={expertMode}
            onValueChange={writeExpertMode}
            trackColor={{ false: t.color.linieWeich, true: t.color.funke }}
            thumbColor={t.color.karte}
          />
        </View>
      </Card>

      <GlassFormPreview
        year={taxYear}
        defaultOpen
        defaultMode="acroform"
        initialAcroForm={initialForm}
        acroFormLoader={acroFormLoader}
        onInspectField={onInspectField}
        hideHeading
      />
    </ScrollView>
  )
}

function makeStyles(t: UiTheme) {
  const screen: ViewStyle = t.layout.overview.narrow
  const wideScreen: ViewStyle = t.layout.overview.wide
  const headerRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', marginBottom: t.space.s4 }
  const heading: TextStyle = { ...t.type.title, color: t.color.tinte, marginBottom: t.space.s2 }
  const intro: TextStyle = { ...t.type.body, color: t.color.tinte2, marginBottom: t.space.s4 }
  const expertCard: ViewStyle = { padding: t.space.s4, marginBottom: t.space.s4 }
  const expertRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s3 }
  const expertText: ViewStyle = { flex: 1, gap: t.space.s1 }
  const expertTitle: TextStyle = { ...t.type.cardTitle, color: t.color.tinte }
  const expertBody: TextStyle = { ...t.type.small, color: t.color.tinte2 }
  return { screen, wideScreen, headerRow, heading, intro, expertCard, expertRow, expertText, expertTitle, expertBody }
}
