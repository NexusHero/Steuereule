import type { ReactElement } from 'react'
import { useNavigationState } from '@react-navigation/native'
import { LeaveGuardProvider } from '../screens/shared/leaveGuard'
import { isSheetRouteName } from './routes'
import { useRemovalGuard } from './useRemovalGuard'

type RemovableNavigation = Parameters<typeof useRemovalGuard>[0]

interface RouteLayoutProps {
  readonly route: { readonly key: string; readonly name: string }
  readonly navigation: RemovableNavigation
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

/**
 * Unmounts a buried stack route, so duplicate back buttons/inputs under `display: none` cannot match
 * accessibility queries and a screen under another cannot act on its own (a buried route's year guard
 * must not fight the one on top), while `CockpitHome` stays mounted behind an open Sheet route.
 * It follows the stack's state itself: since @react-navigation/core 7.23 a route's layout is cached and
 * re-rendered only when its own inputs change, so reading `navigation.getState()` while rendering the
 * layout no longer sees a later push.
 */
function ActiveStackRoute({ route, children }: { readonly route: RouteLayoutProps['route']; readonly children: ReactElement }): ReactElement | null {
  const topRoute = useNavigationState((state) => state.routes[state.index])
  const visible = topRoute?.key === route.key || (route.name === 'CockpitHome' && isSheetRouteName(topRoute?.name))
  return visible ? children : null
}

/** The same for a stack that unmounts its buried routes (`ActiveStackRoute`). */
export function guardedStackRoute({ route, navigation, children }: RouteLayoutProps): ReactElement {
  return (
    <GuardedRoute navigation={navigation}>
      <ActiveStackRoute route={route}>{children}</ActiveStackRoute>
    </GuardedRoute>
  )
}
