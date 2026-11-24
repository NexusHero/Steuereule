import { useState } from 'react'
import { View, Text, Pressable, ActivityIndicator } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Input, Feld, inkOnFunke, useTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { useAuthClient } from '../../auth/AuthClientProvider'
import { makeLoginStyles } from './loginStyles'

export interface ForgotPasswordFormProps {
  readonly onBack: () => void
}

type Stage = 'form' | 'submitting' | 'sent'

/** Where the mailed link leads: our own reset screen. Only the web origin is ever used. */
function resetRedirectUrl(): string {
  const origin = typeof window !== 'undefined' && window.location ? window.location.origin : ''
  return `${origin}/passwort-zuruecksetzen`
}

/**
 * Asks for a reset mail. Whether or not the address has an account, the answer is the same
 * neutral confirmation, so the form cannot be used to find out who has one.
 */
export function ForgotPasswordForm({ onBack }: ForgotPasswordFormProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const authClient = useAuthClient()
  const styles = makeLoginStyles(t)
  const [mail, setMail] = useState('')
  const [stage, setStage] = useState<Stage>('form')
  const [error, setError] = useState('')

  async function submit() {
    if (stage === 'submitting') return
    if (!mail.includes('@')) {
      setError(tr('passwortReset.request.errEmail'))
      return
    }
    setError('')
    setStage('submitting')
    try {
      const { error: authError } = await authClient.requestPasswordReset({ email: mail.trim(), redirectTo: resetRedirectUrl() })
      if (authError?.status === 429) {
        setStage('form')
        setError(tr('passwortReset.request.rateLimited'))
        return
      }
      // A server failure is not "sent"; everything else reads the same, the server does not tell.
      if (authError && authError.status >= 500) {
        setStage('form')
        setError(tr('passwortReset.request.error'))
        return
      }
      setStage('sent')
    } catch {
      setStage('form')
      setError(tr('passwortReset.request.error'))
    }
  }

  return (
    <View style={{ gap: t.space.s4 }}>
      <Text style={{ ...t.type.headline, color: t.color.tinte }} role="heading" aria-level={2}>
        {tr('passwortReset.request.heading')}
      </Text>
      {stage === 'sent' ? (
        <View accessibilityRole="alert" testID="passwort-vergessen-bestaetigung" style={{ gap: t.space.s2 }}>
          <Text style={{ ...t.type.body, color: t.color.tinte }}>{tr('passwortReset.request.confirmation')}</Text>
          <Text style={{ ...t.type.small, color: t.color.tinte2 }}>{tr('passwortReset.request.confirmationHint')}</Text>
        </View>
      ) : (
        <>
          <Text style={{ ...t.type.body, color: t.color.tinte2 }}>{tr('passwortReset.request.body')}</Text>
          <Feld label={tr('passwortReset.request.emailLabel')} error={error}>
            <Input
              type="email"
              value={mail}
              onChange={setMail}
              placeholder={tr('login.emailPlaceholder')}
              autoComplete="email"
              onSubmit={() => void submit()}
              accessibilityLabel={tr('passwortReset.request.emailLabel')}
              testID="passwort-vergessen-email"
            />
          </Feld>
          <Button onPress={() => void submit()} disabled={stage === 'submitting'} testID="passwort-vergessen-senden">
            {stage === 'submitting' ? (
              <View style={styles.submittingRow}>
                <ActivityIndicator size="small" color={inkOnFunke(t)} />
                <Text style={styles.submittingLabel}>{tr('passwortReset.request.submitting')}</Text>
              </View>
            ) : (
              tr('passwortReset.request.submit')
            )}
          </Button>
        </>
      )}
      <View style={styles.linksRow}>
        <Pressable accessibilityRole="link" onPress={onBack} testID="passwort-vergessen-zurueck">
          <Text style={styles.link}>{tr('passwortReset.request.back')}</Text>
        </Pressable>
      </View>
    </View>
  )
}
