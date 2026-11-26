import { useState } from 'react'
import { ScrollView, View, Text, Pressable, ActivityIndicator, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Input, Feld, Sticker, inkOnFunke, useTheme, useBreakpoint, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../i18n/resources'
import { rememberPendingVerification } from '../auth/pendingVerification'
import { useAuthClient } from '../auth/AuthClientProvider'
import { authErrorKey } from '../auth/authErrors'
import { useEmailVerified } from '../auth/useEmailVerified'
import { SocialSignInSection } from './shared/SocialSignInSection'
import { EmailVerificationBanner } from './shared/EmailVerificationBanner'
import { NEW_PASSWORD_MIN_LENGTH } from '../auth/password-policy'
import { LegalLink, LegalLinks } from './legal/LegalLinks'
import type { LegalPage } from './legal/texts'
import { BetaNotice } from './shared/BetaNotice'

export interface RegistrationScreenProps {
  readonly onDone: () => void
  readonly onLogin?: () => void
  /** Opens a legal page inside the app; without it the legal links are plain web links. */
  readonly onLegal?: (page: LegalPage) => void
}

type Stage =
  | { readonly kind: 'form' }
  | { readonly kind: 'submitting' }
  | { readonly kind: 'success'; readonly email: string }

export function RegistrationScreen({ onDone, onLogin, onLegal }: RegistrationScreenProps) {
  const t = useTheme()
  const bp = useBreakpoint()
  const { t: tr } = useTranslation(APP_NS)
  const authClient = useAuthClient()
  const styles = makeStyles(t)

  const [mail, setMail] = useState('')
  const [pass, setPass] = useState('')
  const [errorMessage, setError] = useState('')
  const [stage, setStage] = useState<Stage>({ kind: 'form' })

  // Live: true only once a session for this very address reports it verified (signed in on another tab or
  // device after following the link). A guest, and a taken address, never see it: no oracle.
  const verifiedForThisAccount = useEmailVerified(stage.kind === 'success' ? stage.email : undefined)

  const ok = mail.includes('@') && pass.length >= NEW_PASSWORD_MIN_LENGTH

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
      // The answer is the same for a new and a taken address and carries no session (ADR-0109): say only
      // that a mail is on its way. The guest carries on; the data moves at the first verified sign-in.
      rememberPendingVerification(mail)
      setStage({ kind: 'success', email: mail })
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
        <EmailVerificationBanner email={stage.email} verified={verifiedForThisAccount} />

        <Button onPress={onDone} style={styles.cta} testID="registrierung-success-weiter">
          {tr('registrierung.success.cta')}
        </Button>
      </ScrollView>
    )
  }

  return (
    <ScrollView contentContainerStyle={bp === 's' ? styles.screen : styles.wideScreen} keyboardShouldPersistTaps="handled" testID="screen-container">
      <BetaNotice />
      <Text style={styles.heading} role="heading" aria-level={1}>
        {tr('registrierung.titleBefore')}
        <Text style={{ color: t.color.funkeTinte }}>{tr('registrierung.titleMark')}</Text>
        {tr('registrierung.titleAfter')}
      </Text>
      <Text style={styles.subtitle}>{tr('registrierung.subtitle')}</Text>

      <SocialSignInSection disabled={stage.kind === 'submitting'} onSignedIn={onDone} onError={setError} />

      <Feld label={tr('registrierung.emailLabel')}>
        <Input type="email" value={mail} onChange={setMail} placeholder={tr('registrierung.emailPlaceholder')} autoComplete="email" testID="registrierung-email" />
      </Feld>
      <Feld label={tr('registrierung.passwordLabel')} error={errorMessage}>
        <Input
          type="password"
          value={pass}
          onChange={setPass}
          placeholder={tr('registrierung.passwordPlaceholder')}
          onSubmit={() => void create()}
          autoComplete="new-password"
          testID="registrierung-passwort"
        />
      </Feld>
      <Button onPress={() => void create()} disabled={stage.kind === 'submitting'} testID="registrierung-submit">
        {stage.kind === 'submitting' ? (
          <View style={styles.submittingRow}>
            <ActivityIndicator size="small" color={inkOnFunke(t)} />
            <Text style={styles.submittingLabel}>{tr('registrierung.submitting')}</Text>
          </View>
        ) : (
          tr('registrierung.submit')
        )}
      </Button>
      <Text style={styles.legalNote} testID="registrierung-rechtliches">
        {tr('registrierung.legal.beforeTerms')}
        <LegalLink page="agb" onPage={onLegal} style={styles.legalLink}>
          {tr('registrierung.legal.terms')}
        </LegalLink>
        {tr('registrierung.legal.beforePrivacy')}
        <LegalLink page="datenschutz" onPage={onLegal} style={styles.legalLink}>
          {tr('registrierung.legal.privacy')}
        </LegalLink>
        {tr('registrierung.legal.after')}
      </Text>

      {onLogin ? (
        <View style={styles.linksRow}>
          <Pressable accessibilityRole="link" onPress={onLogin}>
            <Text style={styles.link}>{tr('registrierung.backToLogin')}</Text>
          </Pressable>
        </View>
      ) : null}
      <LegalLinks onPage={onLegal} />
    </ScrollView>
  )
}

function makeStyles(t: UiTheme) {
  const screen: ViewStyle = { ...t.layout.flow.narrow, justifyContent: 'center' }
  const wideScreen: ViewStyle = { ...t.layout.flow.wide, justifyContent: 'center' }
  const successScreen: ViewStyle = { ...screen, alignItems: 'center' }
  const wideSuccessScreen: ViewStyle = { ...wideScreen, alignItems: 'center' }
  const heading: TextStyle = { ...t.type.title, color: t.color.tinte, marginBottom: t.space.s2 }
  const subtitle: TextStyle = { ...t.type.body, color: t.color.tinte2, marginBottom: t.space.s5 }
  const submittingRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s2 }
  const submittingLabel: TextStyle = { ...t.type.button, color: inkOnFunke(t) }
  const legalNote: TextStyle = { ...t.type.caption, color: t.color.tinte2, textAlign: 'center', marginTop: t.space.s3 }
  const legalLink: TextStyle = { ...t.type.caption, color: t.color.tinte, textDecorationLine: 'underline' }
  const successBadge: ViewStyle = { alignSelf: 'center', marginBottom: t.space.s4 }
  const successHeading: TextStyle = { ...t.type.title, color: t.color.tinte, textAlign: 'center', marginBottom: t.space.s2 }
  const successSubtitle: TextStyle = { ...t.type.body, color: t.color.tinte2, textAlign: 'center', marginBottom: t.space.s5 }
  const cta: ViewStyle = { marginTop: t.space.s3 }
  const linksRow: ViewStyle = { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingTop: t.space.s3 }
  const link: TextStyle = { ...t.type.small, color: t.color.tinte }

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
    legalLink,
    successBadge,
    successHeading,
    successSubtitle,
    cta,
    linksRow,
    link,
  }
}
