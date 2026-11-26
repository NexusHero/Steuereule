import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@steuereule/ui'
import { useAccountVerificationControllerVerification } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { useAccountSession } from '../../auth/useAccountSession'

/** The deletion floor as a German calendar date (the sweep counts in UTC instants; the user reads Berlin days). */
export function deletionDateText(iso: string, language: string): string {
  return new Date(iso).toLocaleDateString(language === 'en' ? 'en-GB' : 'de-DE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' })
}

/**
 * API-16 (ADR-0030 §2): while the address is not confirmed, every screen of the app says that the account will
 * be deleted and no sooner than when, and offers the export first (the replacement for the pre-delete export
 * offer a user-initiated deletion makes). The date comes from the API, which knows when the warning went out.
 */
export function UnverifiedAccountBanner({ onOpenExport }: { readonly onOpenExport: () => void }) {
  const t = useTheme()
  const { t: tr, i18n } = useTranslation(APP_NS)
  const { state } = useAccountSession()
  const unverified = state.status === 'signed-in' && state.session.user.emailVerified !== true
  const status = useAccountVerificationControllerVerification({ query: { enabled: unverified } })
  const notBefore = status.data?.data.deletionNotBefore ?? null
  if (!unverified || state.status !== 'signed-in' || notBefore === null) return null
  return (
    <View
      accessibilityRole="alert"
      testID="konto-unbestaetigt"
      style={{ backgroundColor: t.color.warnWeich, borderColor: t.color.warn, borderWidth: 2, borderRadius: t.radius.s, padding: t.space.s3, margin: t.space.s3 }}
    >
      <Text style={{ ...t.type.button, color: t.color.tinte, marginBottom: t.space.s1 }}>{tr('auth.unverifiedAccount.heading')}</Text>
      <Text style={{ ...t.type.small, color: t.color.tinte2, marginBottom: t.space.s2 }}>
        {tr('auth.unverifiedAccount.body', { date: deletionDateText(notBefore, i18n.language), email: state.session.user.email })}
      </Text>
      <Pressable accessibilityRole="button" onPress={onOpenExport} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={{ ...t.type.labelStrong, color: t.color.tinte, textDecorationLine: 'underline' }}>{tr('auth.unverifiedAccount.export')}</Text>
      </Pressable>
    </View>
  )
}
