import { useState } from 'react'
import { ScrollView, View, Text, ActivityIndicator, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Input, Feld, Sticker, inkOnFunke, useTheme, useBreakpoint, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../i18n/resources'
import { useAuthClient } from '../auth/AuthClientProvider'
import { NEW_PASSWORD_MIN_LENGTH } from '../auth/password-policy'

export interface PasswordResetScreenProps {
  /** The one-time token from the mailed link; it only ever goes into the request body. */
  readonly token?: string | undefined
  /** Back to the sign-in (after success). */
  readonly onDone: () => void
  /** To the request form for a new link (invalid or expired token). */
  readonly onRequestNew: () => void
}

type Stage = 'form' | 'submitting' | 'success' | 'invalid'

export function PasswordResetScreen({ token, onDone, onRequestNew }: PasswordResetScreenProps) {
  const t = useTheme()
  const bp = useBreakpoint()
  const { t: tr } = useTranslation(APP_NS)
  const authClient = useAuthClient()
  const styles = makeStyles(t)

  const [pass, setPass] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState('')
  const [stage, setStage] = useState<Stage>(token ? 'form' : 'invalid')

  async function submit() {
    if (stage === 'submitting' || !token) return
    if (pass.length < NEW_PASSWORD_MIN_LENGTH) {
      setError(tr('passwortReset.reset.errTooShort'))
      return
    }
    if (pass !== repeat) {
      setError(tr('passwortReset.reset.errMismatch'))
      return
    }
    setError('')
    setStage('submitting')
    try {
      const { error: authError } = await authClient.resetPassword({ newPassword: pass, token })
      if (!authError) {
        setPass('')
        setRepeat('')
        setStage('success')
        return
      }
      if (authError.code === 'INVALID_TOKEN') {
        setStage('invalid')
        return
      }
      setStage('form')
      if (authError.status === 429) setError(tr('passwortReset.reset.rateLimited'))
      else if (authError.code === 'PASSWORD_COMPROMISED') setError(tr('auth.errPasswordCompromised'))
      else if (authError.code === 'PASSWORD_TOO_SHORT') setError(tr('passwortReset.reset.errTooShort'))
      else setError(tr('auth.errGeneric'))
    } catch {
      setStage('form')
      setError(tr('auth.errGeneric'))
    }
  }

  const containerStyle = bp === 's' ? styles.screen : styles.wideScreen

  if (stage === 'success') {
    return (
      <ScrollView contentContainerStyle={containerStyle} keyboardShouldPersistTaps="handled" testID="screen-container">
        <Sticker style={styles.badge}>{tr('passwortReset.reset.successHeading')}</Sticker>
        <Text style={styles.subtitle} testID="passwort-reset-erfolg">{tr('passwortReset.reset.successBody')}</Text>
        <Button onPress={onDone} testID="passwort-reset-zum-login">
          {tr('passwortReset.reset.toLogin')}
        </Button>
      </ScrollView>
    )
  }

  if (stage === 'invalid') {
    return (
      <ScrollView contentContainerStyle={containerStyle} keyboardShouldPersistTaps="handled" testID="screen-container">
        <View accessibilityRole="alert" testID="passwort-reset-ungueltig">
          <Text style={styles.heading} role="heading" aria-level={1}>{tr('passwortReset.reset.invalidHeading')}</Text>
          <Text style={styles.subtitle}>{tr('passwortReset.reset.invalidBody')}</Text>
        </View>
        <Button onPress={onRequestNew} testID="passwort-reset-neuer-link">
          {tr('passwortReset.reset.requestNew')}
        </Button>
      </ScrollView>
    )
  }

  return (
    <ScrollView contentContainerStyle={containerStyle} keyboardShouldPersistTaps="handled" testID="screen-container">
      <Text style={styles.heading} role="heading" aria-level={1}>{tr('passwortReset.reset.heading')}</Text>
      <Text style={styles.subtitle}>{tr('passwortReset.reset.subtitle')}</Text>
      <Feld label={tr('passwortReset.reset.newLabel')}>
        <Input
          type="password"
          value={pass}
          onChange={setPass}
          placeholder={tr('passwortReset.reset.placeholder')}
          autoComplete="new-password"
          accessibilityLabel={tr('passwortReset.reset.newLabel')}
          testID="passwort-reset-neu"
        />
      </Feld>
      <Feld label={tr('passwortReset.reset.repeatLabel')} error={error}>
        <Input
          type="password"
          value={repeat}
          onChange={setRepeat}
          autoComplete="new-password"
          onSubmit={() => void submit()}
          accessibilityLabel={tr('passwortReset.reset.repeatLabel')}
          testID="passwort-reset-wiederholen"
        />
      </Feld>
      <Button onPress={() => void submit()} disabled={stage === 'submitting'} testID="passwort-reset-speichern">
        {stage === 'submitting' ? (
          <View style={styles.submittingRow}>
            <ActivityIndicator size="small" color={inkOnFunke(t)} />
            <Text style={styles.submittingLabel}>{tr('passwortReset.reset.submitting')}</Text>
          </View>
        ) : (
          tr('passwortReset.reset.submit')
        )}
      </Button>
    </ScrollView>
  )
}

function makeStyles(t: UiTheme) {
  const screen: ViewStyle = { ...t.layout.flow.narrow, justifyContent: 'center' }
  const wideScreen: ViewStyle = { ...t.layout.flow.wide, justifyContent: 'center' }
  const heading: TextStyle = { ...t.type.title, color: t.color.tinte, marginBottom: t.space.s2 }
  const subtitle: TextStyle = { ...t.type.body, color: t.color.tinte2, marginBottom: t.space.s5 }
  const badge: ViewStyle = { alignSelf: 'center', marginBottom: t.space.s4 }
  const submittingRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s2 }
  const submittingLabel: TextStyle = { ...t.type.button, color: inkOnFunke(t) }
  return { screen, wideScreen, heading, subtitle, badge, submittingRow, submittingLabel }
}
