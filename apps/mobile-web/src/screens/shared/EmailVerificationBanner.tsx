// The "please verify your email" banner (and its verified confirmation) shared by LoginScreen's
// unverified stage and RegistrierungScreen's success stage — one component, not two copies
// (Phase 0.3 AC-1). Both screens had the same banner, the same resend affordance, the same
// four-state resend progress, and the same verified confirmation, re-typed in each file; the
// only thing that differed was *which* screen's stage handed it the email.
//
// The live verification read (`useEmailVerified`) stays with the host — it is account-scoped to
// the exact stage the host is showing, and scoping matters differently on LoginScreen (a second
// person on a shared device) than on RegistrierungScreen (the fresh account). The resend flow,
// by contrast, is identical: same `sendVerificationEmail` call, same idle/sending/sent/error
// states, so it lives here once.
import { useState } from 'react'
import { View, Text, Pressable, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { useAuthClient } from '../../auth/AuthClientProvider'

interface EmailVerificationBannerProps {
  /** The server-derived account email the banner names (never a raw input field). */
  readonly email: string
  /** Whether the live session already reports this account as verified — `true` swaps the
   *  "please verify" banner for the positive confirmation. */
  readonly verified: boolean
}

export function EmailVerificationBanner({ email, verified }: EmailVerificationBannerProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const authClient = useAuthClient()
  const styles = makeStyles(t)
  const [resend, setResend] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  async function resendVerification() {
    setResend('sending')
    try {
      const { error } = await authClient.sendVerificationEmail({ email })
      setResend(error ? 'error' : 'sent')
    } catch {
      setResend('error')
    }
  }

  if (verified) {
    return (
      <View style={styles.verifiedBanner} accessibilityRole="alert">
        <Text style={styles.verifiedHeading}>{tr('auth.verifiedBanner.heading')}</Text>
      </View>
    )
  }

  return (
    <View style={styles.verifyBanner} accessibilityRole="alert">
      <Text style={styles.verifyHeading}>{tr('auth.verifyBanner.heading')}</Text>
      <Text style={styles.verifyBody}>{tr('auth.verifyBanner.body', { email })}</Text>
      <Pressable onPress={() => void resendVerification()} disabled={resend === 'sending'}>
        <Text style={styles.verifyResendLink}>
          {resend === 'sending' ? tr('auth.verifyBanner.resendSending') : tr('auth.verifyBanner.resend')}
        </Text>
      </Pressable>
      {resend === 'sent' ? <Text style={styles.verifyResendNote}>{tr('auth.verifyBanner.resendSent')}</Text> : null}
      {resend === 'error' ? <Text style={styles.verifyResendError}>{tr('auth.verifyBanner.resendError')}</Text> : null}
    </View>
  )
}

function makeStyles(t: UiTheme) {
  // `alignSelf: 'stretch'` (not `width: '100%'`) — the banner must fill the column whether the
  // host lays it out in a default-stretch column (LoginScreen's unverified stage) or a centred
  // one (RegistrierungScreen's success stage, whose `alignItems: 'center'` would otherwise
  // shrink-wrap it to its text).
  const verifyBanner: ViewStyle = {
    alignSelf: 'stretch',
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
  // Same box primitive as `verifyBanner`, recolored with the DS's positive semantic pair
  // (`--ok`/`--ok-weich`, `farben-semantik.html`).
  const verifiedBanner: ViewStyle = {
    alignSelf: 'stretch',
    backgroundColor: t.color.okWeich,
    borderWidth: 2,
    borderColor: t.color.ok,
    borderRadius: t.radius.s,
    padding: t.space.s4,
    marginBottom: t.space.s4,
  }
  const verifiedHeading: TextStyle = { fontFamily: t.font.text, fontWeight: t.weight.schwer, fontSize: t.size.m, color: t.color.tinte }
  return { verifyBanner, verifyHeading, verifyBody, verifyResendLink, verifyResendNote, verifyResendError, verifiedBanner, verifiedHeading }
}
