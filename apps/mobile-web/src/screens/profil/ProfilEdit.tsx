// ProfilScreen's edit form — name, Steuer-ID (with live counter/validity), Steuernummer, and the
// save/cancel round trip. Extracted from ProfilScreen.tsx so that file stays a screen. The edit
// form reuses OnboardingScreen's field patterns and validation exactly (REQ-013).
import { ScrollView, View, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Feld, Input, Pill, Sticker, useTheme, type Breakpoint } from '@steuereule/ui'
import { isValidSteuerId } from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'
import { makeProfilStyles } from './styles'
import { formatSteuerId, formatSteuerNr, countDigits } from '../onboarding/format'
import type { OnboardingProfil } from '../onboarding/profileMapping'

interface ProfilEditProps {
  readonly draft: OnboardingProfil
  readonly onChange: (key: keyof OnboardingProfil) => (value: string) => void
  readonly onSave: () => void
  readonly onCancel: () => void
  readonly isSaving: boolean
  readonly saveError: string | null
  readonly bp: Breakpoint
}

export function ProfilEdit({ draft, onChange, onSave, onCancel, isSaving, saveError, bp }: ProfilEditProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeProfilStyles(t)
  const idDigits = countDigits(draft.steuerId)
  const steuerIdOk = isValidSteuerId(draft.steuerId.replace(/\D/g, ''))
  // ADR-0045: the Steuer-ID is OPTIONAL (null = "not given yet") — the save must not require it.
  // The server validates it only when present; the confirmed-sticker below is the display side.
  const canSave = draft.vorname.trim() !== '' && draft.nachname.trim() !== ''

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} keyboardShouldPersistTaps="handled" testID="screen-container">
      <Text style={styles.heading}>{tr('profil.editHeading')}</Text>

      <Feld label={tr('profil.firstNameLabel')}>
        <Input
          value={draft.vorname}
          onChange={onChange('vorname')}
          placeholder={tr('profil.firstNamePlaceholder')}
          accessibilityLabel={tr('profil.firstNameLabel')}
        />
      </Feld>
      <Feld label={tr('profil.lastNameLabel')}>
        <Input
          value={draft.nachname}
          onChange={onChange('nachname')}
          placeholder={tr('profil.lastNamePlaceholder')}
          accessibilityLabel={tr('profil.lastNameLabel')}
        />
      </Feld>
      <Feld label={tr('profil.steuerIdLabel')}>
        <Input
          type="numeric"
          mono
          value={draft.steuerId}
          onChange={(value) => onChange('steuerId')(formatSteuerId(value))}
          placeholder={tr('profil.steuerIdPlaceholder')}
          accessibilityLabel={tr('profil.steuerIdLabel')}
        />
      </Feld>
      <View style={styles.counterRow}>
        <Pill>{tr('profil.steuerIdCounter', { count: idDigits })}</Pill>
        {steuerIdOk ? <Sticker>{tr('profil.steuerIdConfirmed')}</Sticker> : null}
      </View>
      <Feld label={tr('profil.steuerNrLabel')}>
        <Input
          type="numeric"
          mono
          value={draft.steuerNr}
          onChange={(value) => onChange('steuerNr')(formatSteuerNr(value))}
          placeholder={tr('profil.steuerNrPlaceholder')}
          accessibilityLabel={tr('profil.steuerNrLabel')}
        />
      </Feld>

      {saveError !== null ? (
        <Text style={styles.saveErrorText} accessibilityRole="alert">
          {saveError}
        </Text>
      ) : null}

      <Button onPress={onSave} disabled={!canSave || isSaving} style={styles.cta}>
        {isSaving ? tr('profil.saving') : tr('profil.save')}
      </Button>
      <Button variante="ghost" onPress={onCancel} disabled={isSaving} style={styles.cancelButton}>
        {tr('profil.cancel')}
      </Button>
    </ScrollView>
  )
}
