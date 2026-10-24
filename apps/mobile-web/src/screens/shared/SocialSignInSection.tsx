// The social sign-in slot (Google today, Apple #45 stays hidden) shared by LoginScreen and
// RegistrierungScreen — one component, not two near-identical copies (Phase 0.3 AC-1: no
// per-screen re-implementation of the same auth surface). Both screens offered the same
// provider button, the same DS fallback for an unconfigured deployment, and the same divider,
// with only one real difference: LoginScreen also shows the honest "we can't currently tell
// whether Google is available" line when its shared-outage banner is up (a probe that cannot
// answer must say so rather than vanish, #283 §3(a)); RegistrierungScreen stays silent on an
// unresolved probe because it has no shared-outage banner of its own to pair the line with.
// That one difference is the `showUnknownFallback` prop.
//
// The probe answer comes from `useSocialSignInAvailable`, the round trip from `useSocialSignIn`,
// both already shared hooks — this component just owns the *rendering* the two screens used to
// each hand-roll. Error handling stays with the host via `onError` (each screen shows the
// translated error in its own field), success via `onSignedIn`.
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
  /** Whether the host screen is mid-submit — the provider button joins that disabled state. */
  readonly disabled: boolean
  readonly onSignedIn: () => void
  /** The host screen surfaces the (already-translated) social error in its own field. */
  readonly onError: (message: string) => void
  /** Only LoginScreen passes this — see the module header. */
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
    <Button key={key} variante="ghost" onPress={() => void handleSignIn(provider)} disabled={isSubmitting || disabled}>
      {icon} {label}
    </Button>
  )

  const anyAvailable = googleAvailable === 'available' || appleAvailable === 'available'
  if (anyAvailable) {
    return (
      <>
        <View style={styles.socialButtons}>
          {googleAvailable === 'available' ? providerButton('google', tr('login.google'), <GoogleG />, 'google') : null}
          {appleAvailable === 'available' ? providerButton('apple', tr('login.apple'), <AppleG />, 'apple') : null}
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

  // Still probing (or the probe failed) and no shared-outage banner to pair it with — silence,
  // never a flicker, and never a button that would only end in "provider not found".
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
  // The DS's own honest fallback for a genuinely unconfigured/unknown provider (auth.html) — a
  // dashed outline in the button's own place, not silence (#283 §3(a)).
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
  const socialFallbackText: TextStyle = { flexShrink: 1, fontFamily: t.font.text, fontSize: t.size.xs, color: t.color.tinte2 }
  const dividerRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: t.space.s2, marginVertical: t.space.s4 }
  const dividerLine: ViewStyle = { flex: 1, height: 2, backgroundColor: t.color.linieWeich, borderRadius: 1 }
  const dividerLabel: TextStyle = { fontFamily: t.font.mono, fontSize: t.size.xs, color: t.color.tinte2 }
  return { socialButtons, socialFallback, socialFallbackIcon, socialFallbackText, dividerRow, dividerLine, dividerLabel }
}
