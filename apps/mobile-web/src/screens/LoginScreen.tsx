// Login (F: auth.html / Auth.jsx in Funke dress) — email+password against the real better-auth
// client SDK, Google social sign-in (REQ-008), guest mode (#61), and the QR device-login column
// (#238). One primary action. The screen's pieces that are shared with other screens (social
// slot, email-verification banner) or large enough to be their own concern (QR column, page
// header) live in ./login/ and ../shared/ — this file owns the login state machine and the form.
//
// Deliberate deviations from the DS reference: Apple sign-in stays hidden (REQ-008b, #45);
// "Passwort vergessen?" is dropped (no reset flow exists, a dead Pressable doesn't ship); a real
// honest "please verify" banner is added after signing into an unverified account (REQ-005); the
// QR column (#238) is its own column on `m`/`l` per NexusHero's ruling.
//
// #283/#336/#298 (Musti's refinement block + follow-ups) tightened the honesty contract this
// screen carries: the shared-outage banner (`apiUnreachable`) may only claim a screen-wide cause
// on *two* independent transport failures (one surface must never speak for the whole app, F1);
// the QR column keeps its own reason-carrying error vocabulary (AC-B/ADR-0024); and the banner's
// "we're retrying" sentence is only true while a retry is actually scheduled (F2). Those three
// lines are a decision, not an accretion — see the #336 comment block on `apiUnreachable`.
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
import { RechtlichesLinks } from './rechtliches/RechtlichesLinks'
import type { RechtlicheSeite } from './rechtliches/texte'

export interface LoginScreenProps {
  readonly onDone: () => void
  /** Omit to hide "weiter als Gast" — used when this screen is embedded inside the
   *  device-approval flow (#238 AC-7), where a guest has nothing to approve with. */
  readonly onGuest?: () => void
  /** Omit to hide "Neu hier? Konto anlegen" — same reasoning as `onGuest` above. */
  readonly onRegister?: () => void
  /** False when embedded (#238 AC-7) — a second, unrelated device-login column has no
   *  place next to "sign in to approve this code". Defaults to `true`. */
  readonly showDeviceQr?: boolean
  /** Opens a legal page (ADR-0050). Omit when embedded (device approval), where the host
   *  screen already sits behind the public entry that carries these links. */
  readonly onRechtliches?: (seite: RechtlicheSeite) => void
}

type Stage =
  | { readonly kind: 'form' }
  | { readonly kind: 'submitting' }
  | { readonly kind: 'unverified'; readonly email: string }
  | { readonly kind: 'two-factor'; readonly email: string }

export function LoginScreen({ onDone, onGuest, onRegister, showDeviceQr = true, onRechtliches }: LoginScreenProps) {
  const t = useTheme()
  const bp = useBreakpoint()
  const { t: tr } = useTranslation(APP_NS)
  const authClient = useAuthClient()
  const styles = makeLoginStyles(t)

  const [mail, setMail] = useState('')
  const [pass, setPass] = useState('')
  const [fehler, setFehler] = useState('')
  const [stage, setStage] = useState<Stage>({ kind: 'form' })
  // Live, account-scoped, fail-closed — shared with RegistrierungScreen (#194/#217, ADR-0012
  // amendment). Scoping matters more here: this is the screen a second person on a shared
  // device signs in on, so a stale verified session belonging to a *different* account is a
  // routine path, not a race.
  const emailVerified = useEmailVerified(stage.kind === 'unverified' ? stage.email : undefined)

  // The QR device machine is owned here, at the screen's own top level, not inside the QR column:
  // this screen is the one surface that never unmounts on a resize, which is exactly why Musti's
  // block names it as the seam (useDeviceQrCode.ts's §4(2)). `enabled` is false whenever there is
  // structurally no honest use for a code yet (`s`, or embedded usage).
  const deviceQrEnabled = showDeviceQr && bp !== 's'
  const { state: qrState, requestNewCode: requestNewQrCode, autoRetryStatus } = useDeviceQrCode(onDone, deviceQrEnabled)

  // AC-A — one cause, one message, driven off the QR mint's own transport read plus the login
  // form's own transport catch. Deliberately narrow: this must never go true on a real *answer*
  // (wrong password, an expired/denied code, a 429) — only on a genuine "nothing answered" failure.
  const [formTransportError, setFormTransportError] = useState(false)
  const qrUnreachable = qrState.kind === 'error' && qrState.reason === 'unreachable'
  const capabilitiesUnreachable = useSocialSignInAvailable('google') === 'unreachable'

  // #336 review, F1 then F10 — what may claim a SCREEN-WIDE cause. F1 let one surface speak for
  // the whole app (a wrong-password message three lines under "our servers are down"); F10 then
  // separated the wrong things (a total outage said nothing until the user submitted). The line
  // is sufficiency of evidence: two independent surfaces failing at transport is honest evidence
  // of a screen-wide outage; one is not. Ruled by NexusHero (stakeholder), option A of the #336
  // F10 ask — a decision, recorded rather than left to the PR thread.
  const apiUnreachable = formTransportError || (qrUnreachable && capabilitiesUnreachable)

  // #336 F8 — the second, *unrelated* job: has some surface established a real transport failure,
  // so a silent-because-still-probing slot should say it cannot tell rather than vanish (#283 §3(a)).
  const anySurfaceUnreachable = qrUnreachable || capabilitiesUnreachable || formTransportError
  // #298 F2 — the banner's "we're retrying" sentence is only true while a retry is scheduled.
  const apiUnreachableAutoRetrying = autoRetryStatus === 'scheduled'

  const ok = mail.includes('@') && pass.length >= 6

  async function login() {
    if (!ok) {
      setFehler(mail.includes('@') ? tr('login.errPass') : tr('login.errEmail'))
      return
    }
    setFehler('')
    setFormTransportError(false)
    setStage({ kind: 'submitting' })
    // better-auth resolves to `{ data, error }` for a request that reached the server; a genuine
    // network failure rejects instead — both land on an honest state, never an unhandled rejection.
    try {
      const { data, error } = await authClient.signIn.email({ email: mail, password: pass })
      if (error || !data) {
        setStage({ kind: 'form' })
        setFehler(tr(`auth.${authErrorKey(error)}`))
        return
      }
      // REQ-007 — better-auth answers a credential sign-in with `twoFactorRedirect: true`
      // when the account has a second factor pending: the primary factor succeeded but no
      // session was issued. Read with a narrow cast (the client plugin's `$InferServerPlugin`
      // is empty, so the client type doesn't carry this field the server returns).
      if (isTwoFactorChallenge(data)) {
        setStage({ kind: 'two-factor', email: mail })
        return
      }
      if (data.user.emailVerified) {
        // Reset before navigating away — a real loading state must never be left dangling.
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

  // AC-A — the password field's own inline error is suppressed while the shared banner's cause
  // genuinely subsumes it (the form's own submit never reached the server). It is NOT suppressed
  // when only the QR column is down — the auth endpoint answered, and "wrong password" is a real
  // answer that must survive an unrelated surface's failure (#308).
  const passwordFehler = formTransportError ? '' : fehler

  const formColumn = (
    <View style={bp === 's' ? undefined : styles.formColumn}>
      <SocialSignInSection
        disabled={stage.kind === 'submitting'}
        onSignedIn={onDone}
        onError={setFehler}
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
      <Feld label={tr('login.passwordLabel')} fehler={passwordFehler}>
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
          <Pressable accessibilityRole="link" onPress={onRegister}>
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

      {onRechtliches ? <RechtlichesLinks onSeite={onRechtliches} /> : null}
    </View>
  )

  // The QR column has no honest use on `s` — it's the same phone whose camera would have to scan
  // its own screen. `showDeviceQr` folds into the same switch: embedded usage (#238 AC-7) never
  // wants the column, regardless of width. The QR *state machine* is unaffected — only its visual
  // column is conditionally rendered here.
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

/** REQ-007 — better-auth's `twoFactorRedirect` signal. A narrow cast: the client plugin's
 *  `$InferServerPlugin` is empty, so the client type doesn't carry this field the server
 *  returns on a credential sign-in with 2FA pending. */
function isTwoFactorChallenge(data: unknown): data is { twoFactorRedirect: true } {
  return typeof data === 'object' && data !== null && (data as { twoFactorRedirect?: unknown }).twoFactorRedirect === true
}

/** The 2FA challenge after a successful primary factor — a code input that completes sign-in. */
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
      <Feld label={tr('login.twoFactor.codeLabel')} fehler={error}>
        <Input type="text" value={code} onChange={setCode} placeholder="123456" onSubmit={() => void submit()} />
      </Feld>
      <Button onPress={() => void submit()} disabled={busy || !code}>
        {busy ? tr('login.submitting') : tr('login.twoFactor.submit')}
      </Button>
    </View>
  )
}
