// ProfilScreen's read view — the avatar/name/Steuer-ID summary card, the saved notice, the
// "Deine Daten" row that reaches Datenschutz, and the device list. Extracted from
// ProfilScreen.tsx so that file stays a screen.
import { ScrollView, View, Text, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Card, Chip, useTheme, type Breakpoint } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { makeProfilStyles } from './styles'
import { DeviceListSection } from '../device/DeviceListSection'
import type { OnboardingProfil } from '../onboarding/profileMapping'

interface ProfilViewProps {
  readonly profil: OnboardingProfil
  readonly onEdit: () => void
  readonly justSaved: boolean
  readonly bp: Breakpoint
  readonly onOpenDatenschutz: () => void
  readonly onSignedOut: () => void
}

export function ProfilView({ profil, onEdit, justSaved, bp, onOpenDatenschutz, onSignedOut }: ProfilViewProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeProfilStyles(t)
  const fullName = `${profil.vorname} ${profil.nachname}`.trim()
  const initialSource = profil.vorname.trim() || profil.nachname.trim()
  const initial = initialSource ? initialSource[0]?.toUpperCase() : '?'

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} testID="screen-container">
      <Text style={styles.heading}>{tr('profil.cardLabel')}</Text>

      <Card variant="nacht" style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={styles.summaryTextCol}>
            <Text style={styles.name}>{fullName || tr('profil.namePlaceholder')}</Text>
            <Text style={styles.idLine}>{profil.steuerId ? profil.steuerId : tr('profil.emptyNote')}</Text>
          </View>
          <Chip onPress={onEdit}>{tr('profil.edit')}</Chip>
        </View>
      </Card>

      {justSaved ? (
        <Text style={styles.savedNotice} accessibilityLiveRegion="polite">
          {tr('profil.savedNotice')}
        </Text>
      ) : null}

      <Card style={styles.datenCard}>
        <Pressable accessibilityRole="button" onPress={onOpenDatenschutz} style={styles.datenRow}>
          <Text style={styles.datenRowLabel}>{tr('profil.deineDaten.rowLabel')}</Text>
          <Text style={styles.datenRowArrow} aria-hidden={true}>→</Text>
        </Pressable>
      </Card>

      {/* #238 — every session on the account, not just QR-authorized ones (Decision 6). Its
          own file carries the region omission's full reasoning. */}
      <DeviceListSection onCurrentSessionRevoked={onSignedOut} />
    </ScrollView>
  )
}
