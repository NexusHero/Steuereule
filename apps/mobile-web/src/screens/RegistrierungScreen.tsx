// Registrierung (F: registrierung.html / Registrierung.jsx in Funke dress) — create account
// (email + password) against the real better-auth client SDK, then the honest success step
// leading into Onboarding.
//
// Deliberate deviation from the checked-in DS reference (steuereule#72, ADR-0012 §5 — flagged
// to product/DS, see the PR description): the DS demo's middle step is a fixed "Demo-Code:
// 123456" gate the user types in before continuing. ADR-0012 explicitly rejects reproducing
// that mock — the real flow sends a real verification link/token asynchronously and the account
// already works before it's clicked (REQ-005). So there is no code-entry step here; "Konto
// anlegen" goes straight to the same success step the DS shows ("Konto steht ✓" / "Willkommen
// bei SteuerEule"), with an honest "please verify your email" banner added whenever the fresh
// account is still unverified — a state the DS artifact doesn't depict at all.
import { useState } from 'react'
import { ScrollView, View, Text, Pressable, ActivityIndicator, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Input, Feld, Sticker, useTheme, useBreakpoint, WIDE_CONTENT_MAX_WIDTH, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../i18n/resources'
import { useAuthClient } from '../auth/AuthClientProvider'
import { authErrorKey } from '../auth/authErrors'
import { useSocialSignIn } from '../auth/useSocialSignIn'
import { useSocialSignInAvailable } from '../auth/useSocialSignInAvailable'
import { GoogleG } from '../icons/GoogleG'

export interface RegistrierungScreenProps {
  readonly onDone: () => void
}

// `Stage.success` carries only `email` — the server's value from the signup response, never the
// raw input — verification status is read live every render, never snapshotted (#194, ADR-0012 amendment).
type Stage =
  | { readonly kind: 'form' }
  | { readonly kind: 'submitting' }
  | { readonly kind: 'success'; readonly email: string }

export function RegistrierungScreen({ onDone }: RegistrierungScreenProps) {
  const t = useTheme()
  const bp = useBreakpoint()
  const { t: tr } = useTranslation(APP_NS)
  const authClient = useAuthClient()
  const styles = makeStyles(t)

  const [mail, setMail] = useState('')
  const [pass, setPass] = useState('')
  const [fehler, setFehler] = useState('')
  const { signIn: socialSignIn, isSubmitting: socialSubmitting } = useSocialSignIn()
  const googleAvailable = useSocialSignInAvailable('google')
  const [stage, setStage] = useState<Stage>({ kind: 'form' })
  const [resend, setResend] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  // Live, re-read every render — never a snapshot (#194, ADR-0012 amendment).
  const { data: sessionData } = authClient.useSession()

  const ok = mail.includes('@') && pass.length >= 6

  async function anlegen() {
    if (!ok) {
      setFehler(mail.includes('@') ? tr('registrierung.errPass') : tr('registrierung.errEmail'))
      return
    }
    setFehler('')
    setStage({ kind: 'submitting' })
    // better-auth's client only resolves to `{ data, error }` for a request that reached the
    // server; a genuine network failure (offline, DNS, CORS) rejects the promise instead — both
    // must land on the same honest, generic error rather than an unhandled rejection.
    try {
      const { data, error } = await authClient.signUp.email({ name: '', email: mail, password: pass })
      if (error || !data) {
        setStage({ kind: 'form' })
        setFehler(tr(`auth.${authErrorKey(error)}`))
        return
      }
      setStage({ kind: 'success', email: data.user.email })
    } catch {
      setStage({ kind: 'form' })
      setFehler(tr('auth.errGeneric'))
    }
  }

  async function resendVerification(email: string) {
    setResend('sending')
    try {
      const { error } = await authClient.sendVerificationEmail({ email })
      setResend(error ? 'error' : 'sent')
    } catch {
      setResend('error')
    }
  }

  async function googleSignIn() {
    const sozialFehler = await socialSignIn('google')
    if (sozialFehler) {
      setFehler(sozialFehler)
      return
    }
    onDone()
  }

  if (stage.kind === 'success') {
    // Fail-closed: only a session that *positively* answers `emailVerified: true` turns the
    // banner off. On a non-401 session-fetch error, better-auth's atom keeps whatever `data`
    // it last had (session-atom.mjs) rather than clearing it — so inferring "verified" from a
    // missing/errored read would be reachable, and wrong. Absence of a positive answer always
    // means "still show the banner".
    // Scoped to *this* account, not just any signed-in one (Musti's T1): `sessionData` can
    // briefly be a different, already-verified session still resolving after `signUp.email`
    // notifies the atom to refetch, or the atom's stale last-known `data` from before this
    // account existed. Matching `stage.email` (from the signup response, never user input)
    // against `sessionData.user.email` closes both stale-positive paths.
    const verifiedForThisAccount = sessionData?.user.emailVerified === true && sessionData.user.email === stage.email
    return (
      <ScrollView contentContainerStyle={bp === 's' ? styles.successScreen : styles.wideSuccessScreen} keyboardShouldPersistTaps="handled" data-testid="screen-container">
        <Sticker style={styles.successBadge}>{tr('registrierung.success.badge')}</Sticker>
        <Text style={styles.successHeading}>{tr('registrierung.success.heading')}</Text>
        <Text style={styles.successSubtitle}>{tr('registrierung.success.subtitle')}</Text>

        {!verifiedForThisAccount ? (
          <View style={styles.verifyBanner} accessibilityRole="alert">
            <Text style={styles.verifyHeading}>{tr('auth.verifyBanner.heading')}</Text>
            <Text style={styles.verifyBody}>{tr('auth.verifyBanner.body', { email: stage.email })}</Text>
            <Pressable onPress={() => void resendVerification(stage.email)} disabled={resend === 'sending'}>
              <Text style={styles.verifyResendLink}>
                {resend === 'sending' ? tr('auth.verifyBanner.resendSending') : tr('auth.verifyBanner.resend')}
              </Text>
            </Pressable>
            {resend === 'sent' ? <Text style={styles.verifyResendNote}>{tr('auth.verifyBanner.resendSent')}</Text> : null}
            {resend === 'error' ? <Text style={styles.verifyResendError}>{tr('auth.verifyBanner.resendError')}</Text> : null}
          </View>
        ) : (
          // Deliberate DS deviation (#194, stakeholder ruling — see PR description): the DS
          // reference has no verified-state artifact at all. Reuses the same box primitive as
          // the banner above, recolored with `t.color.ok`/`okWeich` — the DS's own existing
          // positive-semantic token pair (`farben-semantik.html`) — instead of `warn`.
          <View style={styles.verifiedBanner} accessibilityRole="alert">
            <Text style={styles.verifiedHeading}>{tr('auth.verifiedBanner.heading')}</Text>
          </View>
        )}

        <Button onPress={onDone} style={styles.cta}>
          {tr('registrierung.success.cta')}
        </Button>
      </ScrollView>
    )
  }

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} keyboardShouldPersistTaps="handled" data-testid="screen-container">
      <Text style={styles.heading}>
        {tr('registrierung.titleBefore')}
        <Text style={{ color: t.color.funkeTinte }}>{tr('registrierung.titleMark')}</Text>
        {tr('registrierung.titleAfter')}
      </Text>
      <Text style={styles.subtitle}>{tr('registrierung.subtitle')}</Text>

      {/* Only offered where the server says Google is actually configured (REQ-008) — a
          deployment without credentials must not show a button whose every press fails.
          The divider goes with it: with no social option above, there is nothing to
          divide the email form from. */}
      {googleAvailable ? (
        <>
          <View style={styles.socialButtons}>
            <Button variante="ghost" onPress={() => void googleSignIn()} disabled={socialSubmitting || stage.kind === 'submitting'}>
              <GoogleG /> {tr('login.google')}
            </Button>
          </View>

          <View style={styles.dividerRow} accessibilityRole="none">
            <View style={styles.dividerLine} />
            <Text style={styles.dividerLabel}>{tr('login.orEmail')}</Text>
            <View style={styles.dividerLine} />
          </View>
        </>
      ) : null}

      <Feld label={tr('registrierung.emailLabel')}>
        <Input type="email" value={mail} onChange={setMail} placeholder={tr('registrierung.emailPlaceholder')} />
      </Feld>
      <Feld label={tr('registrierung.passwordLabel')} fehler={fehler}>
        <Input
          type="password"
          value={pass}
          onChange={setPass}
          placeholder={tr('registrierung.passwordPlaceholder')}
          onSubmit={() => void anlegen()}
        />
      </Feld>
      <Button onPress={() => void anlegen()} disabled={stage.kind === 'submitting'}>
        {stage.kind === 'submitting' ? (
          <View style={styles.submittingRow}>
            <ActivityIndicator size="small" color={t.color.tinte} />
            <Text style={styles.submittingLabel}>{tr('registrierung.submitting')}</Text>
          </View>
        ) : (
          tr('registrierung.submit')
        )}
      </Button>
      <Text style={styles.legalNote}>{tr('registrierung.legalNote')}</Text>
    </ScrollView>
  )
}

function makeStyles(t: UiTheme) {
  const screen: ViewStyle = {
    backgroundColor: t.color.grund,
    paddingHorizontal: t.space.s5,
    paddingVertical: t.space.s6,
    justifyContent: 'center',
    minHeight: '100%',
    maxWidth: 460,
    width: '100%',
    alignSelf: 'center',
  }
  const wideScreen: ViewStyle = { ...screen, maxWidth: WIDE_CONTENT_MAX_WIDTH }
  const successScreen: ViewStyle = { ...screen, alignItems: 'center' }
  const wideSuccessScreen: ViewStyle = { ...successScreen, maxWidth: WIDE_CONTENT_MAX_WIDTH }
  const heading: TextStyle = { fontFamily: t.font.display, fontWeight: t.weight.schwer, fontSize: t.size['3xl'], color: t.color.tinte, marginBottom: t.space.s2 }
  const subtitle: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.m, marginBottom: t.space.s5 }
  const socialButtons: ViewStyle = { flexDirection: 'column', gap: t.space.s2, marginBottom: t.space.s4 }
  const dividerRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s2, marginVertical: t.space.s4 }
  const dividerLine: ViewStyle = { flex: 1, height: 2, backgroundColor: t.color.linieWeich, borderRadius: 1 }
  const dividerLabel: TextStyle = { fontFamily: t.font.mono, fontSize: t.size.xs, color: t.color.tinte2 }
  const submittingRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s2 }
  const submittingLabel: TextStyle = { fontFamily: t.font.text, fontWeight: t.weight.schwer, fontSize: t.size.m, color: t.color.tinte }
  const legalNote: TextStyle = { fontFamily: t.font.text, fontSize: t.size.xs, color: t.color.tinte2, textAlign: 'center', marginTop: t.space.s3 }
  const successBadge: ViewStyle = { alignSelf: 'center', marginBottom: t.space.s4 }
  const successHeading: TextStyle = { fontFamily: t.font.display, fontWeight: t.weight.schwer, fontSize: t.size['3xl'], color: t.color.tinte, textAlign: 'center', marginBottom: t.space.s2 }
  const successSubtitle: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.m, textAlign: 'center', marginBottom: t.space.s5 }
  // `width: '100%'` used to be a call-site workaround for Button's container omitting the
  // DS's own `width: 100%` contract (komponenten.css:12) — Button now carries it by default,
  // so this is just spacing (#177; verified identical box, Musti/Salih).
  const cta: ViewStyle = { marginTop: t.space.s3 }
  const verifyBanner: ViewStyle = {
    backgroundColor: t.color.warnWeich,
    borderWidth: 2,
    borderColor: t.color.warn,
    borderRadius: t.radius.s,
    padding: t.space.s4,
    marginBottom: t.space.s4,
    width: '100%',
  }
  const verifyHeading: TextStyle = { fontFamily: t.font.text, fontWeight: t.weight.schwer, fontSize: t.size.m, color: t.color.tinte, marginBottom: t.space.s1 }
  const verifyBody: TextStyle = { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte2, marginBottom: t.space.s2 }
  const verifyResendLink: TextStyle = { fontFamily: t.font.text, fontWeight: t.weight.schwer, fontSize: t.size.s, color: t.color.tinte, textDecorationLine: 'underline', minHeight: 44, textAlignVertical: 'center' }
  const verifyResendNote: TextStyle = { fontFamily: t.font.text, fontSize: t.size.xs, color: t.color.tinte2, marginTop: t.space.s1 }
  const verifyResendError: TextStyle = { fontFamily: t.font.text, fontSize: t.size.xs, color: t.color.fehler, marginTop: t.space.s1 }
  // Same box primitive as `verifyBanner` above, recolored with the DS's existing positive
  // semantic pair (`--ok`/`--ok-weich`, `farben-semantik.html`) instead of `warn` — the
  // deliberate DS deviation recorded at the call site and in the PR description (#194).
  const verifiedBanner: ViewStyle = {
    backgroundColor: t.color.okWeich,
    borderWidth: 2,
    borderColor: t.color.ok,
    borderRadius: t.radius.s,
    padding: t.space.s4,
    marginBottom: t.space.s4,
    width: '100%',
  }
  const verifiedHeading: TextStyle = { fontFamily: t.font.text, fontWeight: t.weight.schwer, fontSize: t.size.m, color: t.color.tinte }

  return {
    screen,
    wideScreen,
    successScreen,
    wideSuccessScreen,
    heading,
    subtitle,
    socialButtons,
    dividerRow,
    dividerLine,
    dividerLabel,
    submittingRow,
    submittingLabel,
    legalNote,
    successBadge,
    successHeading,
    successSubtitle,
    cta,
    verifyBanner,
    verifyHeading,
    verifyBody,
    verifyResendLink,
    verifyResendNote,
    verifyResendError,
    verifiedBanner,
    verifiedHeading,
  }
}
