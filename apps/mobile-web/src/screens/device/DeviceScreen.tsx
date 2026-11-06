import { useTranslation } from 'react-i18next'
import { useBreakpoint } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { useAccountSession } from '../../auth/useAccountSession'
import { LoginScreen } from '../LoginScreen'
import { DeviceApprovalScreen } from './DeviceApprovalScreen'
import { LoadingState, ErrorState } from '../shared/ScreenState'

export interface DeviceScreenProps {
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

  return <DeviceApprovalScreen userCode={userCode} />
}
