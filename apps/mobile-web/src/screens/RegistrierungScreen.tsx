// Registrierung (F: registrierung.html / Registrierung.jsx in Funke dress) — create account
// (email + password) against the real better-auth client SDK, then the honest success step
// leading into Onboarding.
//
// Deliberate deviation from the DS reference (steuereule#72, ADR-0012 §5): the DS demo's middle
// "Demo-Code: 123456" gate is not reproduced — the real flow sends a real verification link
// asynchronously and the account already works before it's clicked (REQ-005), so "Konto anlegen"
// goes straight to the success step with an honest "please verify" banner when still unverified.
//
// The social slot and the verification banner are shared with LoginScreen (../shared/) — this
// screen owns only the sign-up form and the success step. The "back to login" link closes the
// one dead branch this screen used to have: a user who reached Registrierung and changed their
// mind had no way back (Phase 0.3 AC-2: every screen reachable from every reachable state).
import { useState } from 'react'
import { ScrollView, View, Text, Pressable, ActivityIndicator, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Input, Feld, Sticker, useTheme, useBreakpoint, WIDE_CONTENT_MAX_WIDTH, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../i18n/resources'
import { useAuthClient } from '../auth/AuthClientProvider'
import { authErrorKey } from '../auth/authErrors'
import { useEmailVerified } from '../auth/useEmailVerified'
import { SocialSignInSection } from './shared/SocialSignInSection'
import { EmailVerificationBanner } from './shared/EmailVerificationBanner'

export interface RegistrierungScreenProps {
  readonly onDone: () => void
  /** Returns to Login — the reverse of LoginScreen's "Neu hier? Konto anlegen". Omit where the
   *  screen is embedded and there is no login to return to. */
  readonly onLogin?: () => void
}

// `Stage.success` carries only `email` — the server's value from the signup response, never the
// raw input — verification status is read live every render, never snapshotted (#194).
type Stage =
  | { readonly kind: 'form' }
  | { readonly kind: 'submitting' }
  | { readonly kind: 'success'; readonly email: string }

export function RegistrierungScreen({ onDone, onLogin }: RegistrierungScreenProps) {
  const t = useTheme()
  const bp = useBreakpoint()
  const { t: tr } = useTranslation(APP_NS)
  const authClient = useAuthClient()
  const styles = makeStyles(t)

  const [mail, setMail] = useState('')
  const [pass, setPass] = useState('')
  const [fehler, setFehler] = useState('')
  const [stage, setStage] = useState<Stage>({ kind: 'form' })
  // Live, account-scoped, fail-closed — shared with LoginScreen (#194/#217, ADR-0012 amendment).
  const verifiedForThisAccount = useEmailVerified(stage.kind === 'success' ? stage.email : undefined)

  const ok = mail.includes('@') && pass.length >= 6

  async function anlegen() {
    if (!ok) {
      setFehler(mail.includes('@') ? tr('registrierung.errPass') : tr('registrierung.errEmail'))
      return
    }
    setFehler('')
    setStage({ kind: 'submitting' })
    // better-auth resolves to `{ data, error }` for a request that reached the server; a genuine
    // network failure rejects instead — both land on the same honest, generic error.
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

  if (stage.kind === 'success') {
    return (
      <ScrollView contentContainerStyle={bp === 's' ? styles.successScreen : styles.wideSuccessScreen} keyboardShouldPersistTaps="handled" testID="screen-container">
        <Sticker style={styles.successBadge}>{tr('registrierung.success.badge')}</Sticker>
        {/* Same class Musti's #298 review named for LoginScreen (F8): the DS reference renders
            this as a real `<h1>`; this screen's own page title was visual only. `role="heading"`/
            `aria-level={1}` explicit for the same reason — not left to a level-less default. */}
        <Text style={styles.successHeading} role="heading" aria-level={1}>
          {tr('registrierung.success.heading')}
        </Text>
        <Text style={styles.successSubtitle}>{tr('registrierung.success.subtitle')}</Text>

        <EmailVerificationBanner email={stage.email} verified={verifiedForThisAccount} />

        <Button onPress={onDone} style={styles.cta}>
          {tr('registrierung.success.cta')}
        </Button>
      </ScrollView>
    )
  }

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} keyboardShouldPersistTaps="handled" testID="screen-container">
      <Text style={styles.heading} role="heading" aria-level={1}>
        {tr('registrierung.titleBefore')}
        <Text style={{ color: t.color.funkeTinte }}>{tr('registrierung.titleMark')}</Text>
        {tr('registrierung.titleAfter')}
      </Text>
      <Text style={styles.subtitle}>{tr('registrierung.subtitle')}</Text>

      <SocialSignInSection disabled={stage.kind === 'submitting'} onSignedIn={onDone} onError={setFehler} />

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

      {onLogin ? (
        <View style={styles.linksRow}>
          <Pressable accessibilityRole="link" onPress={onLogin}>
            <Text style={styles.link}>{tr('registrierung.backToLogin')}</Text>
          </Pressable>
        </View>
      ) : null}
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
  const submittingRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s2 }
  const submittingLabel: TextStyle = { fontFamily: t.font.text, fontWeight: t.weight.schwer, fontSize: t.size.m, color: t.color.tinte }
  const legalNote: TextStyle = { fontFamily: t.font.text, fontSize: t.size.xs, color: t.color.tinte2, textAlign: 'center', marginTop: t.space.s3 }
  const successBadge: ViewStyle = { alignSelf: 'center', marginBottom: t.space.s4 }
  const successHeading: TextStyle = { fontFamily: t.font.display, fontWeight: t.weight.schwer, fontSize: t.size['3xl'], color: t.color.tinte, textAlign: 'center', marginBottom: t.space.s2 }
  const successSubtitle: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.m, textAlign: 'center', marginBottom: t.space.s5 }
  const cta: ViewStyle = { marginTop: t.space.s3 }
  const linksRow: ViewStyle = { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingTop: t.space.s3 }
  const link: TextStyle = { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte }

  return {
    screen,
    wideScreen,
    successScreen,
    wideSuccessScreen,
    heading,
    subtitle,
    submittingRow,
    submittingLabel,
    legalNote,
    successBadge,
    successHeading,
    successSubtitle,
    cta,
    linksRow,
    link,
  }
}
