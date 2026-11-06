import { ScrollView, View, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Feld, Input, Pill, Sticker, useTheme, type Breakpoint } from '@steuereule/ui'
import { isValidTaxId } from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'
import { makeProfileStyles } from './styles'
import { formatTaxId, sanitizeTaxNumberInput, countDigits } from '../onboarding/format'
import type { OnboardingProfile } from '../onboarding/profileMapping'

interface ProfileEditProps {
  readonly draft: OnboardingProfile
  readonly onChange: (key: keyof OnboardingProfile) => (value: string) => void
  readonly onSave: () => void
  readonly onCancel: () => void
  readonly isSaving: boolean
  readonly saveError: string | null
  readonly bp: Breakpoint
}

export function ProfileEdit({ draft, onChange, onSave, onCancel, isSaving, saveError, bp }: ProfileEditProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeProfileStyles(t)
  const idDigits = countDigits(draft.steuerId)
  const taxIdOk = isValidTaxId(draft.steuerId.replace(/\D/g, ''))
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
          onChange={(value) => onChange('steuerId')(formatTaxId(value))}
          placeholder={tr('profil.steuerIdPlaceholder')}
          accessibilityLabel={tr('profil.steuerIdLabel')}
        />
      </Feld>
      <View style={styles.counterRow}>
        <Pill>{tr('profil.steuerIdCounter', { count: idDigits })}</Pill>
        {taxIdOk ? <Sticker>{tr('profil.steuerIdConfirmed')}</Sticker> : null}
      </View>
      <Feld label={tr('profil.steuerNrLabel')}>
        <Input
          type="numeric"
          mono
          value={draft.taxNumber}
          onChange={(value) => onChange('taxNumber')(sanitizeTaxNumberInput(value))}
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
      <Button variant="ghost" onPress={onCancel} disabled={isSaving} style={styles.cancelButton}>
        {tr('profil.cancel')}
      </Button>
    </ScrollView>
  )
}
