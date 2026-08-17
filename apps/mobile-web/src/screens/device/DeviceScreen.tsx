// DeviceScreen (#238, task 3) — the composition behind the `/device?user_code=…` route (AC-1).
// Owns the AC-2/AC-7 session gate: a phone with a real account session goes straight to
// GeraetefreigabeScreen's match verification; a phone with none renders LoginScreen embedded,
// in place — never navigating away, so the URL (and therefore `user_code`) survives the whole
// login detour by construction, not by threading a `redirectTo` param through Login. Suhay
// wrote this mechanism into AC-7 itself once it was designed, so a diff that navigates away
// instead is a criterion failure, not a style choice.
//
// Registration/guest are both "you don't have an account yet" paths — NexusHero's ruling on
// the onRegister gap ("wer noch gar kein Konto hat, hat nichts freizugeben") applies
// identically to guest mode, so the embedded LoginScreen omits both (`onGuest`/`onRegister`
// left unset) and hides its own QR column (`showDeviceQr={false}` — a second, unrelated device
// code has no place next to "sign in to approve this one").
import { ActivityIndicator, View, Text, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, useTheme, useBreakpoint, WIDE_CONTENT_MAX_WIDTH, type UiTheme } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { useAccountSession } from '../../auth/useAccountSession'
import { LoginScreen } from '../LoginScreen'
import { GeraetefreigabeScreen } from './GeraetefreigabeScreen'

export interface DeviceScreenProps {
  /** From the URL's `user_code` query param (AC-1) — `undefined` if the route was opened with
   *  no code at all, an honest error state rather than a crash. */
  readonly userCode: string | undefined
}

export function DeviceScreen({ userCode }: DeviceScreenProps) {
  const t = useTheme()
  const bp = useBreakpoint()
  const { t: tr } = useTranslation(APP_NS)
  const styles = makeStyles(t)

  // The one honest source for "does this phone have a real account session" — the same
  // `useAccountSession()` read DatenschutzScreen already uses (#349), which resolves to
  // `signed-out` for a guest (a signed *guest cookie*, ADR-0007/0012 — not a better-auth Session
  // row) and for no session at all alike. That is exactly AC-2/AC-7's fork: an "already signed
  // in phone" means a real account, not a guest.
  //
  // #349 — `sessionState.status === 'unknown'` is a THIRD outcome, distinct from both
  // `signed-in`/`signed-out`: `/get-session` didn't answer (429, a 5xx, no connection), and the
  // pre-fix version of this screen collapsed that into `sessionData === null`, rendering Login
  // to a user who might genuinely have a session — the whole of #349. Never silently guessed
  // either way; see `useAccountSession.ts`'s own header for the full mechanism.
  const { state: sessionState, retry: retrySession } = useAccountSession()

  if (sessionState.status === 'loading') {
    return (
      <View style={bp === 's' ? styles.centerScreen : styles.wideCenterScreen} testID="screen-container">
        <ActivityIndicator size="large" color={t.color.tinte} accessibilityLabel={tr('device.sessionChecking')} />
        <Text style={styles.help}>{tr('device.sessionChecking')}</Text>
      </View>
    )
  }

  if (sessionState.status === 'unknown') {
    return (
      <View style={bp === 's' ? styles.centerScreen : styles.wideCenterScreen} testID="screen-container">
        <Text style={styles.heading} accessibilityRole="alert">
          {tr('device.sessionUnknown.heading')}
        </Text>
        <Text style={styles.help}>{tr('device.sessionUnknown.body')}</Text>
        <Button onPress={retrySession}>{tr('device.sessionUnknown.retry')}</Button>
      </View>
    )
  }

  if (sessionState.status === 'signed-out') {
    return <LoginScreen onDone={() => {}} showDeviceQr={false} />
  }

  if (!userCode) {
    return (
      <View style={bp === 's' ? styles.centerScreen : styles.wideCenterScreen} testID="screen-container">
        <Text style={styles.heading} accessibilityRole="alert">
          {tr('device.missingCode.heading')}
        </Text>
        <Text style={styles.help}>{tr('device.missingCode.body')}</Text>
      </View>
    )
  }

  return <GeraetefreigabeScreen userCode={userCode} />
}

function makeStyles(t: UiTheme) {
  const centerScreen: ViewStyle = {
    backgroundColor: t.color.grund,
    paddingHorizontal: t.space.s5,
    paddingVertical: t.space.s6,
    minHeight: '100%',
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.space.s3,
  }
  const wideCenterScreen: ViewStyle = { ...centerScreen, maxWidth: WIDE_CONTENT_MAX_WIDTH }
  const heading: TextStyle = {
    fontFamily: t.font.display,
    fontWeight: t.weight.schwer,
    fontSize: t.size['3xl'],
    color: t.color.tinte,
    textAlign: 'center',
  }
  const help: TextStyle = { color: t.color.tinte2, fontFamily: t.font.text, fontSize: t.size.m, textAlign: 'center' }

  return { centerScreen, wideCenterScreen, heading, help }
}
