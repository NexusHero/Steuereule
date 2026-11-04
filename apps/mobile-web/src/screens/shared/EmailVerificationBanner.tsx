import { useState } from 'react'
import { View, Text, Pressable, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { useAuthClient } from '../../auth/AuthClientProvider'

interface EmailVerificationBannerProps {
  readonly email: string
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
