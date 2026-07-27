// Login (F: auth.html / Auth.jsx in Funke dress) — email+password against the real better-auth
// client SDK, guest mode (#61). Copy via i18n (de base + en). One primary action.
//
// Deliberate deviations from the checked-in DS reference (steuereule#72, ADR-0012 — see the PR
// description for the full honesty writeup):
//   - Google/Apple sign-in is dropped. The DS demo wires both buttons straight to a successful
//     login; REQ-007/008 (social sign-in) isn't built yet, so showing them would fake success.
//     Hidden rather than a disabled dead button — there's no DS "coming soon" treatment to draw
//     from, and dropping them also keeps a single, unambiguous primary action.
//   - "Passwort vergessen?" is dropped too — no DS artifact for a reset flow exists and it isn't
//     in REQ-005's scope; a dead Pressable doesn't ship.
//   - A real, honest "please verify your email" banner is added after a successful sign-in to an
//     unverified account (REQ-005) — a case neither auth.html nor Auth.jsx shows at all.
import { useState } from 'react'
import { ScrollView, View, Text, Pressable, ActivityIndicator, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Input, Feld, Chip, useTheme, useBreakpoint, WIDE_CONTENT_MAX_WIDTH, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../i18n/resources'
import { useAuthClient } from '../auth/AuthClientProvider'
import { authErrorKey } from '../auth/authErrors'

export interface LoginScreenProps {
  readonly onDone: () => void
  readonly onGuest: () => void
  readonly onRegister: () => void
}

type Stage =
  | { readonly kind: 'form' }
  | { readonly kind: 'submitting' }
  | { readonly kind: 'unverified'; readonly email: string }

export function LoginScreen({ onDone, onGuest, onRegister }: LoginScreenProps) {
  const t = useTheme()
  const bp = useBreakpoint()
  const { t: tr } = useTranslation(APP_NS)
  const authClient = useAuthClient()
  const styles = makeStyles(t)

  const [mail, setMail] = useState('')
  const [pass, setPass] = useState('')
  const [fehler, setFehler] = useState('')
  const [stage, setStage] = useState<Stage>({ kind: 'form' })
  const [resend, setResend] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  const ok = mail.includes('@') && pass.length >= 6

  async function login() {
    if (!ok) {
      setFehler(mail.includes('@') ? tr('login.errPass') : tr('login.errEmail'))
      return
    }
    setFehler('')
    setStage({ kind: 'submitting' })
    // better-auth's client only resolves to `{ data, error }` for a request that reached the
    // server; a genuine network failure (offline, DNS, CORS) rejects the promise instead — both
    // must land on the same honest, generic error rather than an unhandled rejection.
    try {
      const { data, error } = await authClient.signIn.email({ email: mail, password: pass })
      if (error || !data) {
        setStage({ kind: 'form' })
        setFehler(tr(`auth.${authErrorKey(error)}`))
        return
      }
      if (data.user.emailVerified) {
        // Reset before navigating away: in-app this screen unmounts on `onDone`, but a real
        // loading state must never be left dangling if the caller doesn't immediately navigate.
        setStage({ kind: 'form' })
        onDone()
      } else {
        setStage({ kind: 'unverified', email: data.user.email })
      }
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

  if (stage.kind === 'unverified') {
    return (
      <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} keyboardShouldPersistTaps="handled" data-testid="screen-container">
        <Brand tr={tr} t={t} />
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
        <Button onPress={onDone} style={styles.cta}>
          {tr('login.continue')}
        </Button>
      </ScrollView>
    )
  }

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} keyboardShouldPersistTaps="handled" data-testid="screen-container">
      <Brand tr={tr} t={t} />

      <Text style={styles.heading}>
        {tr('login.greetingBefore')}
        <Text style={{ color: t.color.funkeTinte }}>{tr('login.greetingMark')}</Text>
        {tr('login.greetingAfter')}
      </Text>
      <Text style={styles.subtitle}>{tr('login.subtitle')}</Text>

      <Feld label={tr('login.emailLabel')}>
        <Input type="email" value={mail} onChange={setMail} placeholder={tr('login.emailPlaceholder')} />
      </Feld>
      <Feld label={tr('login.passwordLabel')} fehler={fehler}>
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

      <View style={styles.linksRow}>
        <Pressable accessibilityRole="link" onPress={onRegister}>
          <Text style={styles.link}>{tr('login.register')}</Text>
        </Pressable>
      </View>

      <View style={{ alignItems: 'center', marginTop: t.space.s5 }}>
        <Chip onPress={onGuest}>{tr('login.guest')}</Chip>
        <Text style={styles.guestNote}>{tr('login.guestNote')}</Text>
      </View>
    </ScrollView>
  )
}

interface BrandProps {
  readonly tr: (key: string) => string
  readonly t: UiTheme
}

function Brand({ tr, t }: BrandProps) {
  const wordmark: TextStyle = { fontFamily: t.font.display, fontWeight: t.weight.schwer, fontSize: t.size.xl, color: t.color.tinte }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.s2, marginBottom: t.space.s5 }}>
      <Text style={wordmark}>
        {tr('brand.steuer')}
        <Text style={{ color: t.color.funkeTinte }}>{tr('brand.eule')}</Text>
      </Text>
    </View>
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
  const wideScreen: ViewStyle = {
    ...screen,
    maxWidth: WIDE_CONTENT_MAX_WIDTH,
  }
  const heading: TextStyle = { fontFamily: t.font.display, fontWeight: t.weight.schwer, fontSize: t.size['3xl'], color: t.color.tinte, marginBottom: t.space.s2 }
  const subtitle: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.m, marginBottom: t.space.s5 }
  const linksRow: ViewStyle = { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingTop: t.space.s3 }
  const link: TextStyle = { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte }
  const guestNote: TextStyle = { fontFamily: t.font.text, fontSize: t.size.xs, color: t.color.tinte2, textAlign: 'center', marginTop: t.space.s2 }
  const submittingRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s2 }
  const submittingLabel: TextStyle = { fontFamily: t.font.text, fontWeight: t.weight.schwer, fontSize: t.size.m, color: t.color.tinte }
  const cta: ViewStyle = { marginTop: t.space.s5 }
  const verifyBanner: ViewStyle = {
    backgroundColor: t.color.warnWeich,
    borderWidth: 2,
    borderColor: t.color.warn,
    borderRadius: t.radius.s,
    padding: t.space.s4,
    marginBottom: t.space.s4,
  }
  const verifyHeading: TextStyle = { fontFamily: t.font.text, fontWeight: t.weight.schwer, fontSize: t.size.m, color: t.color.tinte, marginBottom: t.space.s1 }
  const verifyBody: TextStyle = { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte2, marginBottom: t.space.s2 }
  const verifyResendLink: TextStyle = { fontFamily: t.font.text, fontWeight: t.weight.schwer, fontSize: t.size.s, color: t.color.tinte, textDecorationLine: 'underline', minHeight: 44, textAlignVertical: 'center' }
  const verifyResendNote: TextStyle = { fontFamily: t.font.text, fontSize: t.size.xs, color: t.color.tinte2, marginTop: t.space.s1 }
  const verifyResendError: TextStyle = { fontFamily: t.font.text, fontSize: t.size.xs, color: t.color.fehler, marginTop: t.space.s1 }

  return {
    screen,
    wideScreen,
    heading,
    subtitle,
    linksRow,
    link,
    guestNote,
    submittingRow,
    submittingLabel,
    cta,
    verifyBanner,
    verifyHeading,
    verifyBody,
    verifyResendLink,
    verifyResendNote,
    verifyResendError,
  }
}
