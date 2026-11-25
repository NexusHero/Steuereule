import { ScrollView, View, Text, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Card, Chip, useTheme, type Breakpoint } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { makeProfileStyles } from './styles'
import { ProfileAppearanceSection } from './ProfileAppearanceSection'
import { ProfileHapticsSection } from './ProfileHapticsSection'
import { ProfileExpertModeSection } from './ProfileExpertModeSection'
import { ProfileDictationModelSection } from './ProfileDictationModelSection'
import { AssistantsListSection } from './AssistentenListSection'
import { DeviceListSection } from '../device/DeviceListSection'
import { useKnownEmployers } from '../master-data/employersStore'
import { useAccountSession } from '../../auth/useAccountSession'
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
  const employers = useKnownEmployers()
  const { state: sessionState } = useAccountSession()
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
            <Text style={styles.name} testID="profil-name">{fullName || tr('profil.namePlaceholder')}</Text>
            <Text style={styles.idLine} testID="profil-steuerid">{profile.steuerId ? profile.steuerId : tr('profil.emptyNote')}</Text>
          </View>
          <Chip onPress={onEdit} testID="profil-bearbeiten">{tr('profil.edit')}</Chip>
        </View>
      </Card>

      {justSaved ? (
        <Text style={styles.savedNotice} accessibilityLiveRegion="polite" testID="profil-gespeichert">
          {tr('profil.savedNotice')}
        </Text>
      ) : null}

      <Card style={styles.datenCard} testID="profil-wissensnetz-card">
        <View style={{ padding: t.space.s3, gap: t.space.s2 }}>
          <Text style={{ ...t.type.emphasis, color: t.color.tinte }}>Steuer-Wissensnetz (Relationen)</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2 }}>
            <View
              style={{
                paddingHorizontal: t.space.s2,
                paddingVertical: t.space.s1,
                borderRadius: t.radius.s,
                backgroundColor: t.color.grund,
              }}
            >
              <Text style={{ ...t.type.caption, color: t.color.tinte }}>
                {`Arbeitgeber: ${employers.length} hinterlegt`}
              </Text>
            </View>
            {employers.map((emp) => (
              <View
                key={emp.id}
                style={{
                  paddingHorizontal: t.space.s2,
                  paddingVertical: t.space.s1,
                  borderRadius: t.radius.s,
                  backgroundColor: t.color.funkeHell,
                }}
                testID={`profil-wissensnetz-emp-${emp.id}`}
              >
                <Text style={{ ...t.type.captionStrong, color: t.color.tinte }}>
                  {emp.name}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </Card>

      {onOpenMasterData ? (
        <Card style={styles.datenCard}>
          <Pressable accessibilityRole="button" onPress={onOpenMasterData} style={styles.datenRow} testID="profil-stammdaten">
            <Text style={styles.datenRowLabel}>{tr('stammdaten.rowLabel')}</Text>
            <Text style={styles.datenRowArrow} aria-hidden={true}>→</Text>
          </Pressable>
        </Card>
      ) : null}

      <Card style={styles.datenCard}>
        <Pressable accessibilityRole="button" onPress={onOpenPrivacy} style={styles.datenRow} testID="profil-datenschutz">
          <Text style={styles.datenRowLabel}>{tr('profil.deineDaten.rowLabel')}</Text>
          <Text style={styles.datenRowArrow} aria-hidden={true}>→</Text>
        </Pressable>
      </Card>

      <Card style={styles.datenCard}>
        <Pressable accessibilityRole="button" onPress={onOpenSecurity} style={styles.datenRow} testID="profil-sicherheit">
          <Text style={styles.datenRowLabel}>{tr('profil.sicherheit.rowLabel')}</Text>
          <Text style={styles.datenRowArrow} aria-hidden={true}>→</Text>
        </Pressable>
      </Card>

      <ProfileAppearanceSection />

      <ProfileHapticsSection />
      <ProfileExpertModeSection />
      <ProfileDictationModelSection />

      {sessionState.status === 'signed-out' ? (
        // NR-18: a guest has no assistants and no devices to list; say that an account is needed instead of an
        // empty list with a "Verbinden" that can only fail.
        <Card style={styles.datenCard} testID="profil-konto-noetig">
          <Text style={{ ...t.type.body, color: t.color.tinte2, padding: t.space.s3 }}>{tr('apiFehler.accountRequired')}</Text>
        </Card>
      ) : (
        <>
          <AssistantsListSection />
          <DeviceListSection onCurrentSessionRevoked={onSignedOut} />
        </>
      )}
    </ScrollView>
  )
}
