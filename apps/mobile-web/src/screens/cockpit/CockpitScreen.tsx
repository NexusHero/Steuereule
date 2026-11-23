import { useTranslation } from 'react-i18next'
import { useBreakpoint } from '@steuereule/ui'
import { APP_NS } from '../../i18n/resources'
import { LoadingState, ErrorState } from '../shared/ScreenState'
import { CockpitEmpty } from './CockpitEmpty'
import { CockpitLoaded } from './CockpitLoaded'
import { useCockpit } from './useCockpit'
import type { CockpitScreenProps } from './cockpitTypes'

export type { CockpitScreenProps } from './cockpitTypes'

export function CockpitScreen(props: CockpitScreenProps) {
  const bp = useBreakpoint()
  const { t: tr } = useTranslation(APP_NS)
  const view = useCockpit(props, bp, tr)

  if (view.kind === 'pending') {
    return <LoadingState bp={bp} label={tr('cockpit.loading')} />
  }
  if (view.kind === 'error') {
    return (
      <ErrorState
        bp={bp}
        heading={tr('cockpit.loadError.heading')}
        message={tr('cockpit.loadError.message')}
        retryLabel={tr('cockpit.loadError.retry')}
        onRetry={view.onRetry}
      />
    )
  }
  if (view.kind === 'empty') return <CockpitEmpty {...view.shared} />
  return (
    <CockpitLoaded
      {...view.shared}
      summary={view.summary}
      confirmation={view.confirmation}
      assistantTaskCount={view.assistantTaskCount}
      {...(view.onOpenConfirmation ? { onOpenConfirmation: view.onOpenConfirmation } : {})}
    />
  )
}
