import type { ReactElement } from 'react'
import type { NavigationState } from '@react-navigation/native'
import { LeaveGuardProvider } from '../screens/shared/leaveGuard'
import { renderActiveStackRoute } from './guards'
import { useRemovalGuard } from './useRemovalGuard'

type RemovableNavigation = Parameters<typeof useRemovalGuard>[0]

interface RouteLayoutProps {
  readonly route: { readonly key: string; readonly name: string }
  readonly navigation: RemovableNavigation & { readonly getState: () => NavigationState }
  readonly children: ReactElement
}

function GuardedRoute({ navigation, children }: { readonly navigation: RemovableNavigation; readonly children: ReactElement | null }) {
  const host = useRemovalGuard(navigation)
  return <LeaveGuardProvider host={host}>{children}</LeaveGuardProvider>
}

/**
 * WEB-40: the `screenLayout` of every navigator. Each route gets its own leave guard, so removing any route that
 * holds a mask (a sheet's X, the browser's back, „Später weiter“, the printout's back) waits for the mask's
 * pending saves, wherever the route lives. `navigation-leave-guard.lock.test.tsx` keeps every navigator on it.
 */
export function guardedRoute({ navigation, children }: RouteLayoutProps): ReactElement {
  return <GuardedRoute navigation={navigation}>{children}</GuardedRoute>
}

/** The same for a stack that unmounts its buried routes (`renderActiveStackRoute`). */
export function guardedStackRoute(props: RouteLayoutProps): ReactElement {
  return <GuardedRoute navigation={props.navigation}>{renderActiveStackRoute(props)}</GuardedRoute>
}
