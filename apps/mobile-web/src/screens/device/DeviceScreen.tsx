// DeviceScreen (#238, task 3) — the composition behind the `/device?user_code=…` route (AC-1).
// Owns the AC-2/AC-7 session gate: a phone with a real account session goes straight to
// GeraetefreigabeScreen's match verification; a phone with none renders LoginScreen embedded,
// in place — never navigating away, so the URL (and therefore `user_code`) survives the whole
// login detour by construction. Registration/guest are both "you don't have an account yet"
// paths (NexusHero's ruling), so the embedded LoginScreen omits both (`onGuest`/`onRegister`
// unset) and hides its own QR column (`showDeviceQr={false}`).
//
// #349 — the session read goes through the shared `useAccountSession()` seam; its `unknown`
// outcome (the server didn't answer) is a THIRD branch, distinct from signed-in/signed-out and
// never silently collapsed into either.
import { useTranslation } from 'react-i18next'
import { useBreakpoint } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { useAccountSession } from '../../auth/useAccountSession'
import { LoginScreen } from '../LoginScreen'
import { GeraetefreigabeScreen } from './GeraetefreigabeScreen'
import { LoadingState, ErrorState } from '../shared/ScreenState'

export interface DeviceScreenProps {
  /** From the URL's `user_code` query param (AC-1) — `undefined` if the route was opened with
   *  no code at all, an honest error state rather than a crash. */
  readonly userCode: string | undefined
}

export function DeviceScreen({ userCode }: DeviceScreenProps) {
  const bp = useBreakpoint()
  const { t: tr } = useTranslation(APP_NS)
  const { state: sessionState, retry: retrySession } = useAccountSession()

  if (sessionState.status === 'loading') {
    return <LoadingState bp={bp} label={tr('device.sessionChecking')} />
  }

  if (sessionState.status === 'unknown') {
    return (
      <ErrorState
        bp={bp}
        heading={tr('device.sessionUnknown.heading')}
        message={tr('device.sessionUnknown.body')}
        retryLabel={tr('device.sessionUnknown.retry')}
        onRetry={retrySession}
      />
    )
  }

  if (sessionState.status === 'signed-out') {
    return <LoginScreen onDone={() => {}} showDeviceQr={false} />
  }

  if (!userCode) {
    return <ErrorState bp={bp} heading={tr('device.missingCode.heading')} message={tr('device.missingCode.body')} />
  }

  return <GeraetefreigabeScreen userCode={userCode} />
}
