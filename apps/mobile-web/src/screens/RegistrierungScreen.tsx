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
import { MIN_PASSWORD_LENGTH } from '../auth/password-policy'

export interface RegistrationScreenProps {
  readonly onDone: () => void
  readonly onLogin?: () => void
}

type Stage =
  | { readonly kind: 'form' }
  | { readonly kind: 'submitting' }
  | { readonly kind: 'success'; readonly email: string }

export function RegistrationScreen({ onDone, onLogin }: RegistrationScreenProps) {
  const t = useTheme()
  const bp = useBreakpoint()
  const { t: tr } = useTranslation(APP_NS)
  const authClient = useAuthClient()
  const styles = makeStyles(t)

  const [mail, setMail] = useState('')
  const [pass, setPass] = useState('')
  const [fehler, setError] = useState('')
  const [stage, setStage] = useState<Stage>({ kind: 'form' })
  const verifiedForThisAccount = useEmailVerified(stage.kind === 'success' ? stage.email : undefined)

  const ok = mail.includes('@') && pass.length >= MIN_PASSWORD_LENGTH

  async function create() {
    if (!ok) {
      setError(mail.includes('@') ? tr('registrierung.errPass') : tr('registrierung.errEmail'))
      return
    }
    setError('')
    setStage({ kind: 'submitting' })
    try {
      const { data, error } = await authClient.signUp.email({ name: '', email: mail, password: pass })
      if (error || !data) {
        setStage({ kind: 'form' })
        setError(tr(`auth.${authErrorKey(error)}`))
        return
      }
      setStage({ kind: 'success', email: data.user.email })
    } catch {
      setStage({ kind: 'form' })
      setError(tr('auth.errGeneric'))
    }
  }

  if (stage.kind === 'success') {
    return (
      <ScrollView contentContainerStyle={bp === 's' ? styles.successScreen : styles.wideSuccessScreen} keyboardShouldPersistTaps="handled" testID="screen-container">
        <Sticker style={styles.successBadge}>{tr('registrierung.success.badge')}</Sticker>
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

      <SocialSignInSection disabled={stage.kind === 'submitting'} onSignedIn={onDone} onError={setError} />

      <Feld label={tr('registrierung.emailLabel')}>
        <Input type="email" value={mail} onChange={setMail} placeholder={tr('registrierung.emailPlaceholder')} />
      </Feld>
      <Feld label={tr('registrierung.passwordLabel')} error={fehler}>
        <Input
          type="password"
          value={pass}
          onChange={setPass}
          placeholder={tr('registrierung.passwordPlaceholder')}
          onSubmit={() => void create()}
        />
      </Feld>
      <Button onPress={() => void create()} disabled={stage.kind === 'submitting'}>
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
