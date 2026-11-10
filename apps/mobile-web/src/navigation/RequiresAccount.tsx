import { useEffect, type ReactNode } from 'react'
import { StackActions, useLinkBuilder, useNavigation, useRoute, type ParamListBase } from '@react-navigation/native'
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs'
import { useAccountSession } from '../auth/useAccountSession'
import { rememberReturnTo } from '../screens/funnel/sessionMemory'
import type { AppTabParamList } from './routes'

export interface RequiresAccountProps {
  readonly children: ReactNode
}

/**
 * Guards account-only stack routes. Guests opening a deep link are sent to AccountWall
 * with the current /app/… path persisted for post-login return (AC 3).
 */
export function RequiresAccount({ children }: RequiresAccountProps) {
  const { state: sessionState } = useAccountSession()
  const navigation = useNavigation<BottomTabNavigationProp<ParamListBase>>()
  const route = useRoute()
  const { buildHref } = useLinkBuilder()

  useEffect(() => {
    if (sessionState.status !== 'signed-out') return
    const built = buildHref(route.name, route.params as object | undefined)
    const browserPath = typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : ''
    const targetPath = built && built.startsWith('/app/') ? built : browserPath
    rememberReturnTo(targetPath)

    const state = navigation.getState()
    if (!state) return
    if (state.routeNames.includes('AccountWall')) {
      navigation.dispatch(StackActions.replace('AccountWall'))
      return
    }
    if (state.index > 0) {
      navigation.dispatch(StackActions.popToTop())
    } else {
      const rootRoute = state.routeNames[0]
      if (rootRoute) navigation.dispatch(StackActions.replace(rootRoute))
    }
    navigation.getParent<BottomTabNavigationProp<AppTabParamList>>()?.navigate('Cockpit', {
      screen: 'AccountWall',
      initial: false,
    })
  }, [sessionState.status, buildHref, route.name, route.params, navigation])

  if (sessionState.status === 'loading' || sessionState.status === 'signed-out') {
    return null
  }
  return <>{children}</>
}
