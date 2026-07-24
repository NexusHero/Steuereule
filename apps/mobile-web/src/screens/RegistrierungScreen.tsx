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
// account is still unverified — a state the DS artifact doesn't depict at all. The DS reference
// itself needs a follow-up update to stop promising a code-gate that no longer exists.
import { useState } from 'react'
import { ScrollView, View, Text, Pressable, ActivityIndicator, Platform, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Input, Feld, Sticker, useTheme, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../i18n/resources'
import { useAuthClient } from '../auth/AuthClientProvider'
import { authErrorKey } from '../auth/authErrors'

export interface RegistrierungScreenProps {
  readonly onDone: () => void
}

type Stage =
  | { readonly kind: 'form' }
  | { readonly kind: 'submitting' }
  | { readonly kind: 'success'; readonly email: string; readonly emailVerified: boolean }

export function RegistrierungScreen({ onDone }: RegistrierungScreenProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const authClient = useAuthClient()
  const styles = makeStyles(t)

  const [mail, setMail] = useState('')
  const [pass, setPass] = useState('')
  const [fehler, setFehler] = useState('')
  const [stage, setStage] = useState<Stage>({ kind: 'form' })
  const [resend, setResend] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

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
      setStage({ kind: 'success', email: data.user.email, emailVerified: data.user.emailVerified })
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

  if (stage.kind === 'success') {
    return (
      <ScrollView contentContainerStyle={styles.successScreen} keyboardShouldPersistTaps="handled">
        <Sticker style={styles.successBadge}>{tr('registrierung.success.badge')}</Sticker>
        <Text style={styles.successHeading}>{tr('registrierung.success.heading')}</Text>
        <Text style={styles.successSubtitle}>{tr('registrierung.success.subtitle')}</Text>

        {!stage.emailVerified ? (
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
        ) : null}

        <Button onPress={onDone} style={styles.cta}>
          {tr('registrierung.success.cta')}
        </Button>
      </ScrollView>
    )
  }

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>
        {tr('registrierung.titleBefore')}
        <Text style={{ color: t.color.funkeTinte }}>{tr('registrierung.titleMark')}</Text>
        {tr('registrierung.titleAfter')}
      </Text>
      <Text style={styles.subtitle}>{tr('registrierung.subtitle')}</Text>

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
  const isWide = Platform.OS === 'web'
  const screen: ViewStyle = {
    backgroundColor: t.color.grund,
    paddingHorizontal: t.space.s5,
    paddingVertical: t.space.s6,
    justifyContent: 'center',
    minHeight: '100%',
    maxWidth: isWide ? 800 : 460,
    width: '100%',
    alignSelf: 'center',
  }
  const successScreen: ViewStyle = { ...screen, alignItems: 'center' }
  const heading: TextStyle = { fontFamily: t.font.display, fontWeight: t.weight.schwer, fontSize: t.size['3xl'], color: t.color.tinte, marginBottom: t.space.s2 }
  const subtitle: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.m, marginBottom: t.space.s5 }
  const submittingRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s2 }
  const submittingLabel: TextStyle = { fontFamily: t.font.text, fontWeight: t.weight.schwer, fontSize: t.size.m, color: t.color.tinte }
  const legalNote: TextStyle = { fontFamily: t.font.text, fontSize: t.size.xs, color: t.color.tinte2, textAlign: 'center', marginTop: t.space.s3 }
  const successBadge: ViewStyle = { alignSelf: 'center', marginBottom: t.space.s4 }
  const successHeading: TextStyle = { fontFamily: t.font.display, fontWeight: t.weight.schwer, fontSize: t.size['3xl'], color: t.color.tinte, textAlign: 'center', marginBottom: t.space.s2 }
  const successSubtitle: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.m, textAlign: 'center', marginBottom: t.space.s5 }
  const cta: ViewStyle = { marginTop: t.space.s3, width: '100%' }
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

  return {
    screen,
    successScreen,
    heading,
    subtitle,
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
  }
}
