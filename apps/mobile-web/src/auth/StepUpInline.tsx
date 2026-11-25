import { useState } from 'react'
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Feld, Input, useTheme } from '@steuereule/ui'
import { APP_NS } from '../i18n/resources'
import { StepUpChoices } from './StepUpOptions'
import { useStepUp } from './useStepUp'

/**
 * The step-up as a block inside a screen (P6): shown when an action answered `FRESH_AUTH_REQUIRED`. The password
 * where the account has one, the passkey or provider otherwise; `onConfirmed` retries the action.
 */
export function StepUpInline({ onConfirmed, onCancel, testID = 'stepup' }: { readonly onConfirmed: () => void; readonly onCancel: () => void; readonly testID?: string }) {
  const theme = useTheme()
  const { t } = useTranslation(APP_NS)
  const stepUp = useStepUp()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function confirm() {
    if (password === '') return
    setBusy(true)
    const failed = await stepUp.verifyPassword(password)
    setBusy(false)
    if (failed !== null) return setError(failed)
    setPassword('')
    onConfirmed()
  }

  return (
    <View style={{ gap: theme.space.s2, marginTop: theme.space.s3 }} testID={testID}>
      <Text style={{ ...theme.type.emphasis, color: theme.color.tinte }}>{t('stepUp.heading')}</Text>
      <Text style={{ ...theme.type.small, color: theme.color.tinte2 }}>{t('stepUp.body')}</Text>
      <StepUpChoices onConfirmed={onConfirmed} testID={`${testID}-ohne-passwort`}>
        <Feld label={t('stepUp.password')} error={error}>
          <Input type="password" value={password} onChange={setPassword} autoComplete="current-password" testID={`${testID}-passwort`} onSubmit={() => void confirm()} />
        </Feld>
        <Button onPress={() => void confirm()} disabled={busy || password === ''} testID={`${testID}-bestaetigen`}>
          {t('stepUp.confirm')}
        </Button>
      </StepUpChoices>
      <Button variant="ghost" onPress={onCancel} testID={`${testID}-abbrechen`}>
        {t('stepUp.cancel')}
      </Button>
    </View>
  )
}
