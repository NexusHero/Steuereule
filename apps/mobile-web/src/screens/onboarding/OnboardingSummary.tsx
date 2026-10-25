// OnboardingScreen's summary step — the read-back card of the three collected values and the
// submit CTA. Extracted from OnboardingScreen.tsx so that file stays a screen; this file owns
// the final step's read-only layout and its inline submit error.
import { ScrollView, View, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Card, Sticker, useTheme, type Breakpoint } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { makeOnboardingStyles } from './styles'
import type { OnboardingProfil } from './profileMapping'

interface OnboardingSummaryProps {
  readonly profil: OnboardingProfil
  readonly onSubmit: () => void
  readonly onEdit: () => void
  readonly isSubmitting: boolean
  readonly submitError: string | null
  readonly bp: Breakpoint
}

export function OnboardingSummary({ profil, onSubmit, onEdit, isSubmitting, submitError, bp }: OnboardingSummaryProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeOnboardingStyles(t)
  const rows: ReadonlyArray<readonly [string, string, boolean]> = [
    [tr('onboarding.summary.rowFirstName'), profil.vorname, false],
    [tr('onboarding.summary.rowLastName'), profil.nachname, false],
    // ADR-0045: the Steuer-ID may be skipped in step 2 and added later from Profil.
    [tr('onboarding.summary.rowSteuerId'), profil.steuerId || tr('onboarding.summary.steuerIdLater'), true],
    [tr('onboarding.summary.rowSteuerNr'), profil.steuerNr || tr('onboarding.summary.steuerNrLater'), true],
  ]

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} keyboardShouldPersistTaps="handled" testID="screen-container">
      <View style={styles.summaryHeadingRow}>
        <Text style={styles.summaryHeading}>{tr('onboarding.summary.heading')}</Text>
        <Sticker>{tr('onboarding.summary.badge')}</Sticker>
      </View>
      <Text style={styles.help}>{tr('onboarding.summary.intro')}</Text>

      <Card variant="nacht">
        <Text style={styles.cardLabel}>{tr('onboarding.summary.cardLabel')}</Text>
        {rows.map(([label, value, mono]) => (
          <View key={label} style={styles.summaryRow}>
            <Text style={styles.summaryRowLabel}>{label}</Text>
            <Text style={[styles.summaryRowValue, mono ? styles.summaryRowValueMono : null]}>{value}</Text>
          </View>
        ))}
      </Card>

      {submitError !== null ? (
        <Text style={styles.submitError} accessibilityRole="alert">
          {submitError}
        </Text>
      ) : null}

      <Button onPress={onSubmit} disabled={isSubmitting} style={styles.cta}>
        {isSubmitting ? tr('onboarding.summary.submitting') : tr('onboarding.summary.cta')}
      </Button>
      <Button variante="ghost" onPress={onEdit} disabled={isSubmitting} style={styles.summaryEditButton}>
        {tr('onboarding.summary.changeDetails')}
      </Button>
      <Text style={styles.summaryFooterNote}>{tr('onboarding.summary.footerNote')}</Text>
    </ScrollView>
  )
}
