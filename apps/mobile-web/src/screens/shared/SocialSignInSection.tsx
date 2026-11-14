import { View, Text, type ViewStyle, type TextStyle } from 'react-native'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, useTheme, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { useSocialSignIn, type SocialProvider } from '../../auth/useSocialSignIn'
import { useSocialSignInAvailable } from '../../auth/useSocialSignInAvailable'
import { GoogleG } from '../../icons/GoogleG'
import { AppleG } from '../../icons/AppleG'

interface SocialSignInSectionProps {
  readonly disabled: boolean
  readonly onSignedIn: () => void
  readonly onError: (message: string) => void
  readonly showUnknownFallback?: boolean
}

export function SocialSignInSection({ disabled, onSignedIn, onError, showUnknownFallback }: SocialSignInSectionProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  const { signIn, isSubmitting } = useSocialSignIn()
  const googleAvailable = useSocialSignInAvailable('google')
  const appleAvailable = useSocialSignInAvailable('apple')

  async function handleSignIn(provider: SocialProvider) {
    const error = await signIn(provider)
    if (error) onError(error)
    else onSignedIn()
  }

  const providerButton = (provider: SocialProvider, label: string, icon: ReactElement, key: string) => (
    <Button key={key} variant="ghost" onPress={() => void handleSignIn(provider)} disabled={isSubmitting || disabled}>
      {icon} {label}
    </Button>
  )

  const anyAvailable = googleAvailable === 'available' || appleAvailable === 'available'
  if (anyAvailable) {
    return (
      <>
        <View style={styles.socialButtons}>
          {googleAvailable === 'available' ? providerButton('google', tr('login.google'), <GoogleG />, 'google') : null}
          {appleAvailable === 'available' ? providerButton('apple', tr('login.apple'), <AppleG color={t.color.tinte} />, 'apple') : null}
        </View>
        <SocialDivider />
      </>
    )
  }

  if (googleAvailable === 'not-configured' || showUnknownFallback === true) {
    return (
      <>
        <View style={styles.socialFallback} accessibilityRole="text">
          <View style={styles.socialFallbackIcon}>
            <GoogleG />
          </View>
          <Text style={styles.socialFallbackText}>
            {googleAvailable === 'not-configured' ? tr('login.googleNotConfigured') : tr('login.googleUnknown')}
          </Text>
        </View>
        <SocialDivider />
      </>
    )
  }

  return null
}

function SocialDivider() {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)
  return (
    <View style={styles.dividerRow} accessibilityRole="none">
      <View style={styles.dividerLine} />
      <Text style={styles.dividerLabel}>{tr('login.orEmail')}</Text>
      <View style={styles.dividerLine} />
    </View>
  )
}

function makeStyles(t: UiTheme) {
  const socialButtons: ViewStyle = { flexDirection: 'column', gap: t.space.s2, marginBottom: t.space.s4 }
  const socialFallback: ViewStyle = {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.space.s2,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: t.color.linieWeich,
    borderRadius: t.radius.pille,
    paddingHorizontal: t.space.s4,
    marginBottom: t.space.s4,
  }
  const socialFallbackIcon: ViewStyle = { opacity: 0.45 }
  const socialFallbackText: TextStyle = { ...t.type.caption, flexShrink: 1, color: t.color.tinte2 }
  const dividerRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s2, marginVertical: t.space.s4 }
  const dividerLine: ViewStyle = { flex: 1, height: 2, backgroundColor: t.color.linieWeich, borderRadius: 1 }
  const dividerLabel: TextStyle = { ...t.type.meta, color: t.color.tinte2 }
  return { socialButtons, socialFallback, socialFallbackIcon, socialFallbackText, dividerRow, dividerLine, dividerLabel }
}
