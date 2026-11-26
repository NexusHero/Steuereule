import { useState } from 'react'
import { Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Card, Feld, Input, useTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { useOptionalAuthClient } from '../../auth/AuthClientProvider'
import { authErrorKey, type AuthErrorLike } from '../../auth/authErrors'
import { NEW_PASSWORD_MIN_LENGTH } from '../../auth/password-policy'
import { useHasPassword } from '../../auth/StepUpOptions'

interface ChangePasswordClientSurface {
  changePassword: (body: { currentPassword: string; newPassword: string; revokeOtherSessions: boolean }) => Promise<{ error: AuthErrorLike | null }>
}

/**
 * Changing the password in the app (WEB-8). The current password is the proof (better-auth checks it), so no
 * separate step-up is asked. The server rotates this session and ends every other one and every assistant
 * connection (ADR-0103, ADR-0106 D5); the text says so. Shown only for an account that has a password.
 */
export function ChangePasswordSection() {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const client = useOptionalAuthClient() as unknown as ChangePasswordClientSurface | null
  const hasPassword = useHasPassword()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  if (client === null || hasPassword !== true) return null

  async function submit() {
    if (client === null) return
    setDone(false)
    if (next.length < NEW_PASSWORD_MIN_LENGTH) return setError(tr('sicherheit.changePassword.errTooShort'))
    if (next !== repeat) return setError(tr('sicherheit.changePassword.errMismatch'))
    setError(null)
    setBusy(true)
    try {
      const { error: failed } = await client.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true })
      if (failed) {
        setError(failed.code === 'INVALID_PASSWORD' ? tr('sicherheit.changePassword.errWrong') : tr(`auth.${authErrorKey(failed)}`))
        return
      }
      setCurrent('')
      setNext('')
      setRepeat('')
      setDone(true)
    } catch {
      setError(tr('auth.errGeneric'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card style={{ marginTop: t.space.s4 }} testID="passwort-aendern">
      <Text style={{ ...t.type.emphasis, color: t.color.tinte, marginBottom: t.space.s2 }} accessibilityRole="header">
        {tr('sicherheit.changePassword.heading')}
      </Text>
      <Text style={{ ...t.type.body, color: t.color.tinte2, marginBottom: t.space.s3 }}>{tr('sicherheit.changePassword.body')}</Text>
      <Feld label={tr('sicherheit.changePassword.current')}>
        <Input type="password" value={current} onChange={setCurrent} autoComplete="current-password" testID="passwort-aktuell" />
      </Feld>
      <Feld label={tr('sicherheit.changePassword.next')}>
        <Input type="password" value={next} onChange={setNext} autoComplete="new-password" placeholder={tr('registrierung.passwordPlaceholder')} testID="passwort-neu" />
      </Feld>
      <Feld label={tr('sicherheit.changePassword.repeat')} error={error ?? ''}>
        <Input type="password" value={repeat} onChange={setRepeat} autoComplete="new-password" testID="passwort-wiederholen" onSubmit={() => void submit()} />
      </Feld>
      <Button onPress={() => void submit()} disabled={busy || current === '' || next === ''} testID="passwort-aendern-speichern">
        {busy ? tr('sicherheit.busy') : tr('sicherheit.changePassword.submit')}
      </Button>
      {done ? (
        <Text style={{ ...t.type.small, color: t.color.tinte, marginTop: t.space.s2 }} accessibilityRole="alert" testID="passwort-geaendert">
          {tr('sicherheit.changePassword.done')}
        </Text>
      ) : null}
    </Card>
  )
}
