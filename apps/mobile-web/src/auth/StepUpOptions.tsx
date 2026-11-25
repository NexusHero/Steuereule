import { useEffect, useState, type ReactNode } from 'react'
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, useTheme } from '@steuereule/ui'
import { APP_NS } from '../i18n/resources'
import { useOptionalAuthClient } from './AuthClientProvider'
import type { AuthErrorLike } from './authErrors'
import { useSocialSignIn, type SocialProvider } from './useSocialSignIn'

/** How this account can prove it is its owner again (WEB-50): a password, a passkey, a provider sign-in. */
export interface StepUpMethods {
  readonly password: boolean
  readonly passkey: boolean
  readonly providers: readonly SocialProvider[]
}

interface StepUpMethodsClientSurface {
  $fetch: <T>(path: string, opts: { method: 'GET' }) => Promise<{ data?: T | null; error: AuthErrorLike | null }>
  signIn: { passkey: () => Promise<{ data?: unknown; error: AuthErrorLike | null }> }
}

const PROVIDERS: readonly SocialProvider[] = ['google', 'apple']

/**
 * Reads the account's sign-in methods. When the lookup fails, it assumes a password, so the dialog still offers
 * the way most accounts have.
 */
export function useStepUpMethods(): StepUpMethods | null {
  const client = useOptionalAuthClient() as unknown as StepUpMethodsClientSurface | null
  const [methods, setMethods] = useState<StepUpMethods | null>(null)
  useEffect(() => {
    let alive = true
    if (client === null) {
      setMethods({ password: true, passkey: false, providers: [] })
      return
    }
    void (async () => {
      try {
        const [accounts, passkeys] = await Promise.all([
          client.$fetch<{ providerId: string }[]>('/list-accounts', { method: 'GET' }),
          client.$fetch<unknown[]>('/passkey/list-user-passkeys', { method: 'GET' }),
        ])
        const providerIds = Array.isArray(accounts.data) ? accounts.data.map((account) => account.providerId) : null
        if (!alive) return
        setMethods({
          password: providerIds === null || providerIds.includes('credential'),
          passkey: Array.isArray(passkeys.data) && passkeys.data.length > 0,
          providers: PROVIDERS.filter((provider) => providerIds?.includes(provider) ?? false),
        })
      } catch {
        if (alive) setMethods({ password: true, passkey: false, providers: [] })
      }
    })()
    return () => {
      alive = false
    }
  }, [client])
  return methods
}

/** Whether the account has a password; null while unknown, true when the lookup fails (WEB-8). */
export function useHasPassword(): boolean | null {
  const client = useOptionalAuthClient() as unknown as StepUpMethodsClientSurface | null
  const [hasPassword, setHasPassword] = useState<boolean | null>(null)
  useEffect(() => {
    let alive = true
    if (client === null) return
    void client
      .$fetch<{ providerId: string }[]>('/list-accounts', { method: 'GET' })
      .then((accounts) => {
        if (alive) setHasPassword(Array.isArray(accounts.data) ? accounts.data.some((account) => account.providerId === 'credential') : true)
      })
      .catch(() => {
        if (alive) setHasPassword(true)
      })
    return () => {
      alive = false
    }
  }, [client])
  return hasPassword
}

export interface PasswordlessStepUpOptionsProps {
  readonly methods: StepUpMethods | null
  /** Called once the passkey confirmed it: the session is fresh now, the caller retries its action. */
  readonly onConfirmed: () => void
  readonly testID?: string
}

/**
 * The step-up for an account without a password, or for one that prefers its passkey (WEB-50, MCP-11): a passkey
 * sign-in or a sign-in with the provider, in place and without signing out. Either yields a fresh session, which
 * the step-up rule accepts. The provider sign-in leaves the page and comes back to it; the action is tapped again.
 */
export function PasswordlessStepUpOptions({ methods, onConfirmed, testID = 'stepup-ohne-passwort' }: PasswordlessStepUpOptionsProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const client = useOptionalAuthClient() as unknown as StepUpMethodsClientSurface | null
  const social = useSocialSignIn()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (methods === null || (!methods.passkey && methods.providers.length === 0)) return null

  async function withPasskey() {
    setError(null)
    setBusy(true)
    try {
      if (client === null) return
      const { error: failed } = await client.signIn.passkey()
      if (failed) {
        setError(tr('stepUp.passkeyFailed'))
        return
      }
      onConfirmed()
    } catch {
      setError(tr('stepUp.passkeyFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function withProvider(provider: SocialProvider) {
    setError(null)
    const returnTo = typeof window !== 'undefined' ? window.location.href : undefined
    const failed = await social.signIn(provider, returnTo)
    if (failed !== null) setError(failed)
  }

  return (
    <View style={{ gap: t.space.s2, marginTop: t.space.s3 }} testID={testID}>
      <Text style={{ ...t.type.small, color: t.color.tinte2 }}>{tr(methods.password ? 'stepUp.orWithout' : 'stepUp.without')}</Text>
      {methods.passkey ? (
        <Button variant="ghost" disabled={busy} onPress={() => void withPasskey()} testID={`${testID}-passkey`}>
          {tr('stepUp.withPasskey')}
        </Button>
      ) : null}
      {methods.providers.map((provider) => (
        <Button key={provider} variant="ghost" disabled={social.isSubmitting} onPress={() => void withProvider(provider)} testID={`${testID}-${provider}`}>
          {tr(`stepUp.withProvider.${provider}`)}
        </Button>
      ))}
      {error !== null ? (
        <Text style={{ ...t.type.small, color: t.color.fehler }} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  )
}

export interface StepUpChoicesProps {
  /** The password field and its button; shown unless the account has no password. */
  readonly children: ReactNode
  readonly onConfirmed: () => void
  readonly testID?: string
}

/** The whole step-up: the password where the account has one, and the passkey or provider otherwise or besides. */
export function StepUpChoices({ children, onConfirmed, testID }: StepUpChoicesProps) {
  const methods = useStepUpMethods()
  return (
    <>
      {methods === null || methods.password ? children : null}
      {methods !== null && (methods.passkey || methods.providers.length > 0) ? (
        <PasswordlessStepUpOptions methods={methods} onConfirmed={onConfirmed} {...(testID !== undefined ? { testID } : {})} />
      ) : null}
    </>
  )
}
