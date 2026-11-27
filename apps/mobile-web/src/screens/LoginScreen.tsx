import { useState } from 'react'
import { ScrollView, View, Text, Pressable, ActivityIndicator } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Input, Feld, Chip, inkOnFunke, useTheme, useBreakpoint } from '@steuereule/ui'
import { APP_NS } from '../i18n/resources'
import { useAuthClient } from '../auth/AuthClientProvider'
import { authErrorKey } from '../auth/authErrors'
import { useSocialSignInAvailable } from '../auth/useSocialSignInAvailable'
import { useDeviceQrCode } from '../auth/useDeviceQrCode'
import { useTwoFactor } from '../auth/useTwoFactor'
import { PageHeader } from './login/PageHeader'
import { DeviceQrColumn } from './login/DeviceQrColumn'
import { makeLoginStyles } from './login/loginStyles'
import { SocialSignInSection } from './shared/SocialSignInSection'
import { ForgotPasswordForm } from './login/ForgotPasswordForm'
import { LegalLinks } from './legal/LegalLinks'
import { BetaNotice } from './shared/BetaNotice'
import type { LegalPage } from './legal/texts'
import { MIN_PASSWORD_LENGTH } from '../auth/password-policy'
import { isAssistantSignIn } from '../auth/assistant-sign-in'

export interface LoginScreenProps {
  readonly onDone: () => void
  readonly onGuest?: () => void
  readonly onRegister?: () => void
  readonly showDeviceQr?: boolean
  readonly onLegal?: (page: LegalPage) => void
  /** Opens on the „Passwort vergessen“ form (from an expired reset link). */
  readonly startWithForgot?: boolean
  /** The session ran out mid-work (WEB-24): say so; after signing in the app returns to that place. */
  readonly sessionExpired?: boolean
  /** Arrived from the verification link: the address is confirmed, now sign in (WEB-5). */
  readonly emailVerified?: boolean
  /** Arrived from an expired or invalid verification link (`?error=`, WEB-5). */
  readonly verificationFailed?: boolean
  /** A Google/Apple sign-in came back with an error (WEB-33). */
  readonly socialSignInFailed?: boolean
  /** Arrived from the verification link of an account that no longer exists (`?error=ACCOUNT_REMOVED`, ADR-0030 §5). */
  readonly accountRemoved?: boolean
}

/** The `error` the API puts on a verification link whose account was removed (`removed-account-link.ts`). */
export const ACCOUNT_REMOVED_ERROR = 'ACCOUNT_REMOVED'

type Stage =
  | { readonly kind: 'form' }
  | { readonly kind: 'submitting' }
  | { readonly kind: 'two-factor'; readonly email: string }
  | { readonly kind: 'forgot' }

export function LoginScreen({ onDone, onGuest, onRegister, showDeviceQr = true, onLegal, startWithForgot = false, sessionExpired = false, emailVerified = false, verificationFailed = false, socialSignInFailed = false, accountRemoved = false }: LoginScreenProps) {
  const t = useTheme()
  const bp = useBreakpoint()
  const { t: tr } = useTranslation(APP_NS)
  const authClient = useAuthClient()
  const styles = makeLoginStyles(t)

  const [mail, setMail] = useState('')
  const [pass, setPass] = useState('')
  const [errorMessage, setError] = useState('')
  const [stage, setStage] = useState<Stage>(startWithForgot ? { kind: 'forgot' } : { kind: 'form' })

  const deviceQrEnabled = showDeviceQr && bp !== 's'
  const { state: qrState, requestNewCode: requestNewQrCode, autoRetryStatus } = useDeviceQrCode(onDone, deviceQrEnabled)

  const [formTransportError, setFormTransportError] = useState(false)
  const qrUnreachable = qrState.kind === 'error' && qrState.reason === 'unreachable'
  const capabilitiesUnreachable = useSocialSignInAvailable('google') === 'unreachable'

  const apiUnreachable = formTransportError || (qrUnreachable && capabilitiesUnreachable)

  const anySurfaceUnreachable = qrUnreachable || capabilitiesUnreachable || formTransportError
  const apiUnreachableAutoRetrying = autoRetryStatus === 'scheduled'

  const ok = mail.includes('@') && pass.length >= MIN_PASSWORD_LENGTH

  async function login() {
    if (!ok) {
      setError(mail.includes('@') ? tr('login.errPass') : tr('login.errEmail'))
      return
    }
    setError('')
    setFormTransportError(false)
    setStage({ kind: 'submitting' })
    try {
      const { data, error } = await authClient.signIn.email({ email: mail, password: pass })
      if (error || !data) {
        setStage({ kind: 'form' })
        setError(tr(`auth.${authErrorKey(error)}`))
        return
      }
      if (isTwoFactorChallenge(data)) {
        setStage({ kind: 'two-factor', email: mail })
        return
      }
      // Signed in for an assistant's connection: the client is already on its way to the consent.
      if (continuesElsewhere(data)) return
      // An unverified account never gets here: the server refuses its sign-in (ADR-0109).
      setStage({ kind: 'form' })
      onDone()
    } catch {
      setStage({ kind: 'form' })
      setFormTransportError(true)
    }
  }

  if (stage.kind === 'two-factor') {
    return (
      <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} keyboardShouldPersistTaps="handled" testID="screen-container">
        <PageHeader tr={tr} t={t} showDivider={false} />
        <TwoFactorChallenge email={stage.email} onDone={onDone} />
      </ScrollView>
    )
  }

  if (stage.kind === 'forgot') {
    return (
      <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} keyboardShouldPersistTaps="handled" testID="screen-container">
        <PageHeader tr={tr} t={t} showDivider={false} />
        <View style={bp === 's' ? undefined : styles.formColumn}>
          <ForgotPasswordForm onBack={() => setStage({ kind: 'form' })} />
        </View>
      </ScrollView>
    )
  }

  const passwordError = formTransportError ? '' : errorMessage

  const formColumn = (
    <View style={bp === 's' ? undefined : styles.formColumn}>
      <BetaNotice compact />
      <SocialSignInSection
        disabled={stage.kind === 'submitting'}
        onSignedIn={onDone}
        onError={setError}
        showUnknownFallback={anySurfaceUnreachable}
      />

      {emailVerified && !verificationFailed ? (
        <View style={styles.successBanner} accessibilityRole="alert" testID="email-bestaetigt">
          <Text style={styles.outageHeading}>{tr('login.verified.heading')}</Text>
          <Text style={styles.outageBody}>{tr('login.verified.body')}</Text>
        </View>
      ) : null}

      {accountRemoved ? (
        <View style={styles.outageBanner} accessibilityRole="alert" testID="konto-entfernt">
          <Text style={styles.outageHeading}>{tr('login.accountRemoved.heading')}</Text>
          <Text style={styles.outageBody}>{tr('login.accountRemoved.body')}</Text>
          {onRegister ? <Button variant="ghost" onPress={onRegister} testID="konto-entfernt-registrieren">{tr('login.accountRemoved.register')}</Button> : null}
        </View>
      ) : null}

      {verificationFailed ? (
        <View style={styles.outageBanner} accessibilityRole="alert" testID="email-link-abgelaufen">
          <Text style={styles.outageHeading}>{tr('login.verifyFailed.heading')}</Text>
          <Text style={styles.outageBody}>{tr('login.verifyFailed.body')}</Text>
        </View>
      ) : null}

      {socialSignInFailed ? (
        <View style={styles.outageBanner} accessibilityRole="alert" testID="sozial-anmeldung-fehlgeschlagen">
          <Text style={styles.outageBody}>{tr('login.socialFailed')}</Text>
        </View>
      ) : null}

      {sessionExpired ? (
        <View style={styles.outageBanner} accessibilityRole="alert" testID="anmeldung-abgelaufen">
          <Text style={styles.outageBody}>{tr('apiFehler.sessionExpiredBanner')}</Text>
        </View>
      ) : null}

      {apiUnreachable ? (
        <View style={styles.outageBanner} accessibilityRole="alert">
          <Text style={styles.outageHeading}>{tr('login.apiUnreachable.heading')}</Text>
          <Text style={styles.outageBody}>
            {apiUnreachableAutoRetrying ? tr('login.apiUnreachable.bodyRetrying') : tr('login.apiUnreachable.body')}
          </Text>
        </View>
      ) : null}

      <Feld label={tr('login.emailLabel')}>
        <Input type="email" value={mail} onChange={setMail} placeholder={tr('login.emailPlaceholder')} autoComplete="email" />
      </Feld>
      <Feld label={tr('login.passwordLabel')} error={passwordError}>
        <Input type="password" value={pass} onChange={setPass} placeholder="••••••••" autoComplete="current-password" onSubmit={() => void login()} />
      </Feld>
      <Button onPress={() => void login()} disabled={stage.kind === 'submitting'}>
        {stage.kind === 'submitting' ? (
          <View style={styles.submittingRow}>
            <ActivityIndicator size="small" color={inkOnFunke(t)} />
            <Text style={styles.submittingLabel}>{tr('login.submitting')}</Text>
          </View>
        ) : (
          tr('login.submit')
        )}
      </Button>

      <View style={styles.linksRow}>
        <Pressable accessibilityRole="link" onPress={() => setStage({ kind: 'forgot' })} testID="login-passwort-vergessen">
          <Text style={styles.link}>{tr('login.forgot')}</Text>
        </Pressable>
      </View>

      {onRegister ? (
        <View style={styles.linksRow}>
          <Pressable accessibilityRole="link" onPress={onRegister} testID="login-register-link">
            <Text style={styles.link}>{tr('login.register')}</Text>
          </Pressable>
        </View>
      ) : null}

      {onGuest ? (
        <View style={{ alignItems: 'center', marginTop: t.space.s5 }}>
          <Chip onPress={onGuest} testID="login-guest-link">{tr('login.guest')}</Chip>
          <Text style={styles.guestNote}>{tr('login.guestNote')}</Text>
        </View>
      ) : null}

      {onLegal ? <LegalLinks onPage={onLegal} /> : null}
    </View>
  )

  if (bp === 's' || !showDeviceQr) {
    return (
      <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled" testID="screen-container">
        <PageHeader tr={tr} t={t} showDivider={false} />
        {formColumn}
      </ScrollView>
    )
  }

  return (
    <ScrollView contentContainerStyle={styles.wideScreen} keyboardShouldPersistTaps="handled" testID="screen-container">
      <PageHeader tr={tr} t={t} showDivider />
      <View style={styles.wideRow}>
        {formColumn}
        <DeviceQrColumn
          t={t}
          tr={tr}
          state={qrState}
          requestNewCode={requestNewQrCode}
          screenBannerShown={apiUnreachable}
          autoRetryStatus={autoRetryStatus}
        />
      </View>
    </ScrollView>
  )
}

function isTwoFactorChallenge(data: unknown): data is { twoFactorRedirect: true } {
  return typeof data === 'object' && data !== null && (data as { twoFactorRedirect?: unknown }).twoFactorRedirect === true
}

function TwoFactorChallenge({ email, onDone }: { readonly email: string; readonly onDone: () => void }) {
  const { t: tr } = useTranslation(APP_NS)
  const t = useTheme()
  const twoFactor = useTwoFactor()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Without the authenticator app: one of the backup codes shown at the 2FA setup (#450 Teil 5A).
  const [useBackupCode, setUseBackupCode] = useState(false)

  async function submit() {
    if (!code) return
    setBusy(true)
    setError('')
    const err = useBackupCode ? await twoFactor.verifyBackupCode(code.trim()) : await twoFactor.verifyTotp(code)
    if (err) {
      setError(err)
      setBusy(false)
      return
    }
    // In an assistant's connection the client is already on its way to the consent.
    if (isAssistantSignIn()) return
    onDone()
  }

  function switchMode() {
    setUseBackupCode((v) => !v)
    setCode('')
    setError('')
  }

  return (
    <View style={{ gap: t.space.s4 }}>
      <Text style={{ ...t.type.headline, color: t.color.tinte }}>
        {tr('login.twoFactor.heading')}
      </Text>
      <Text style={{ ...t.type.small, color: t.color.tinte2 }}>
        {useBackupCode ? tr('login.twoFactor.backupBody') : tr('login.twoFactor.body', { email })}
      </Text>
      <Feld label={useBackupCode ? tr('login.twoFactor.backupLabel') : tr('login.twoFactor.codeLabel')} error={error}>
        {useBackupCode ? (
          <Input type="text" value={code} onChange={setCode} autoComplete="one-time-code" onSubmit={() => void submit()} accessibilityLabel={tr('login.twoFactor.backupLabel')} testID="login-zweifaktor-backup-code" />
        ) : (
          <Input type="numeric" value={code} onChange={setCode} placeholder="123456" autoComplete="one-time-code" onSubmit={() => void submit()} accessibilityLabel={tr('login.twoFactor.codeLabel')} testID="login-zweifaktor-code" />
        )}
      </Feld>
      <Button onPress={() => void submit()} disabled={busy || !code} testID="login-zweifaktor-bestaetigen">
        {busy ? tr('login.submitting') : tr('login.twoFactor.submit')}
      </Button>
      <Button variant="ghost" onPress={switchMode} testID="login-zweifaktor-modus">
        {useBackupCode ? tr('login.twoFactor.useApp') : tr('login.twoFactor.useBackup')}
      </Button>
    </View>
  )
}

/** better-auth answers a sign-in inside an OAuth flow with where it goes on; its redirect plugin follows. */
function continuesElsewhere(data: unknown): boolean {
  const answer = data as { readonly redirect?: unknown; readonly url?: unknown }
  return answer.redirect === true && typeof answer.url === 'string' && answer.url.length > 0
}
