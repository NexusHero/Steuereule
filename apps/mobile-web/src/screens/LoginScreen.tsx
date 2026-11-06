import { useState } from 'react'
import { ScrollView, View, Text, Pressable, ActivityIndicator } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Input, Feld, Chip, useTheme, useBreakpoint } from '@steuereule/ui'
import { APP_NS } from '../i18n/resources'
import { useAuthClient } from '../auth/AuthClientProvider'
import { authErrorKey } from '../auth/authErrors'
import { useSocialSignInAvailable } from '../auth/useSocialSignInAvailable'
import { useEmailVerified } from '../auth/useEmailVerified'
import { useDeviceQrCode } from '../auth/useDeviceQrCode'
import { useTwoFactor } from '../auth/useTwoFactor'
import { PageHeader } from './login/PageHeader'
import { DeviceQrColumn } from './login/DeviceQrColumn'
import { makeLoginStyles } from './login/loginStyles'
import { SocialSignInSection } from './shared/SocialSignInSection'
import { EmailVerificationBanner } from './shared/EmailVerificationBanner'
import { LegalLinks } from './legal/LegalLinks'
import type { LegalPage } from './legal/texts'
import { MIN_PASSWORD_LENGTH } from '../auth/password-policy'

export interface LoginScreenProps {
  readonly onDone: () => void
  readonly onGuest?: () => void
  readonly onRegister?: () => void
  readonly showDeviceQr?: boolean
  readonly onLegal?: (page: LegalPage) => void
}

type Stage =
  | { readonly kind: 'form' }
  | { readonly kind: 'submitting' }
  | { readonly kind: 'unverified'; readonly email: string }
  | { readonly kind: 'two-factor'; readonly email: string }

export function LoginScreen({ onDone, onGuest, onRegister, showDeviceQr = true, onLegal }: LoginScreenProps) {
  const t = useTheme()
  const bp = useBreakpoint()
  const { t: tr } = useTranslation(APP_NS)
  const authClient = useAuthClient()
  const styles = makeLoginStyles(t)

  const [mail, setMail] = useState('')
  const [pass, setPass] = useState('')
  const [errorMessage, setError] = useState('')
  const [stage, setStage] = useState<Stage>({ kind: 'form' })
  const emailVerified = useEmailVerified(stage.kind === 'unverified' ? stage.email : undefined)

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
      if (data.user.emailVerified) {
        setStage({ kind: 'form' })
        onDone()
      } else {
        setStage({ kind: 'unverified', email: data.user.email })
      }
    } catch {
      setStage({ kind: 'form' })
      setFormTransportError(true)
    }
  }

  if (stage.kind === 'unverified') {
    return (
      <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} keyboardShouldPersistTaps="handled" testID="screen-container">
        <PageHeader tr={tr} t={t} showDivider={false} />
        <EmailVerificationBanner email={stage.email} verified={emailVerified} />
        <Button onPress={onDone} style={styles.cta}>
          {tr('login.continue')}
        </Button>
      </ScrollView>
    )
  }

  if (stage.kind === 'two-factor') {
    return (
      <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} keyboardShouldPersistTaps="handled" testID="screen-container">
        <PageHeader tr={tr} t={t} showDivider={false} />
        <TwoFactorChallenge email={stage.email} onDone={onDone} />
      </ScrollView>
    )
  }

  const passwordError = formTransportError ? '' : errorMessage

  const formColumn = (
    <View style={bp === 's' ? undefined : styles.formColumn}>
      <SocialSignInSection
        disabled={stage.kind === 'submitting'}
        onSignedIn={onDone}
        onError={setError}
        showUnknownFallback={anySurfaceUnreachable}
      />

      {apiUnreachable ? (
        <View style={styles.outageBanner} accessibilityRole="alert">
          <Text style={styles.outageHeading}>{tr('login.apiUnreachable.heading')}</Text>
          <Text style={styles.outageBody}>
            {apiUnreachableAutoRetrying ? tr('login.apiUnreachable.bodyRetrying') : tr('login.apiUnreachable.body')}
          </Text>
        </View>
      ) : null}

      <Feld label={tr('login.emailLabel')}>
        <Input type="email" value={mail} onChange={setMail} placeholder={tr('login.emailPlaceholder')} />
      </Feld>
      <Feld label={tr('login.passwordLabel')} error={passwordError}>
        <Input type="password" value={pass} onChange={setPass} placeholder="••••••••" onSubmit={() => void login()} />
      </Feld>
      <Button onPress={() => void login()} disabled={stage.kind === 'submitting'}>
        {stage.kind === 'submitting' ? (
          <View style={styles.submittingRow}>
            <ActivityIndicator size="small" color={t.color.tinte} />
            <Text style={styles.submittingLabel}>{tr('login.submitting')}</Text>
          </View>
        ) : (
          tr('login.submit')
        )}
      </Button>

      {onRegister ? (
        <View style={styles.linksRow}>
          <Pressable accessibilityRole="link" onPress={onRegister} testID="login-register-link">
            <Text style={styles.link}>{tr('login.register')}</Text>
          </Pressable>
        </View>
      ) : null}

      {onGuest ? (
        <View style={{ alignItems: 'center', marginTop: t.space.s5 }}>
          <Chip onPress={onGuest}>{tr('login.guest')}</Chip>
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

  async function submit() {
    if (!code) return
    setBusy(true)
    setError('')
    const err = await twoFactor.verifyTotp(code)
    if (err) {
      setError(err)
      setBusy(false)
      return
    }
    onDone()
  }

  return (
    <View style={{ gap: t.space.s4 }}>
      <Text style={{ fontFamily: t.font.display, fontWeight: t.weight.schwer, fontSize: t.size['2xl'], color: t.color.tinte }}>
        {tr('login.twoFactor.heading')}
      </Text>
      <Text style={{ fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte2 }}>
        {tr('login.twoFactor.body', { email })}
      </Text>
      <Feld label={tr('login.twoFactor.codeLabel')} error={error}>
        <Input type="text" value={code} onChange={setCode} placeholder="123456" onSubmit={() => void submit()} />
      </Feld>
      <Button onPress={() => void submit()} disabled={busy || !code}>
        {busy ? tr('login.submitting') : tr('login.twoFactor.submit')}
      </Button>
    </View>
  )
}
