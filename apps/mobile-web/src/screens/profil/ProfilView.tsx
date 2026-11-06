import { ScrollView, View, Text, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Card, Chip, useTheme, type Breakpoint } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { makeProfileStyles } from './styles'
import { AssistantsListSection } from './AssistentenListSection'
import { DeviceListSection } from '../device/DeviceListSection'
import type { OnboardingProfile } from '../onboarding/profileMapping'

interface ProfileViewProps {
  readonly profile: OnboardingProfile
  readonly onEdit: () => void
  readonly justSaved: boolean
  readonly bp: Breakpoint
  readonly onOpenPrivacy: () => void
  readonly onOpenSecurity: () => void
  readonly onOpenMasterData?: () => void
  readonly onSignedOut: () => void
}

export function ProfileView({ profile, onEdit, justSaved, bp, onOpenPrivacy, onOpenSecurity, onOpenMasterData, onSignedOut }: ProfileViewProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeProfileStyles(t)
  const fullName = `${profile.firstName} ${profile.lastName}`.trim()
  const initialSource = profile.firstName.trim() || profile.lastName.trim()
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
            <Text style={styles.idLine}>{profile.steuerId ? profile.steuerId : tr('profil.emptyNote')}</Text>
          </View>
          <Chip onPress={onEdit}>{tr('profil.edit')}</Chip>
        </View>
      </Card>

      {justSaved ? (
        <Text style={styles.savedNotice} accessibilityLiveRegion="polite">
          {tr('profil.savedNotice')}
        </Text>
      ) : null}

      {onOpenMasterData ? (
        <Card style={styles.datenCard}>
          <Pressable accessibilityRole="button" onPress={onOpenMasterData} style={styles.datenRow}>
            <Text style={styles.datenRowLabel}>{tr('stammdaten.rowLabel')}</Text>
            <Text style={styles.datenRowArrow} aria-hidden={true}>→</Text>
          </Pressable>
        </Card>
      ) : null}

      <Card style={styles.datenCard}>
        <Pressable accessibilityRole="button" onPress={onOpenPrivacy} style={styles.datenRow}>
          <Text style={styles.datenRowLabel}>{tr('profil.deineDaten.rowLabel')}</Text>
          <Text style={styles.datenRowArrow} aria-hidden={true}>→</Text>
        </Pressable>
      </Card>

      <Card style={styles.datenCard}>
        <Pressable accessibilityRole="button" onPress={onOpenSecurity} style={styles.datenRow}>
          <Text style={styles.datenRowLabel}>{tr('profil.sicherheit.rowLabel')}</Text>
          <Text style={styles.datenRowArrow} aria-hidden={true}>→</Text>
        </Pressable>
      </Card>

      <AssistantsListSection />

      <DeviceListSection onCurrentSessionRevoked={onSignedOut} />
    </ScrollView>
  )
}
