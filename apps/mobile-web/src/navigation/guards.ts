import { createElement, Fragment, useEffect, type ReactElement } from 'react'
import type { NavigationState } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { SELECTABLE_TAX_YEARS } from '../config/taxYear'
import { useShellState } from './ShellState'
import { isSheetRouteName, type CockpitStackParamList } from './routes'

export function isSelectableYear(rawYear: unknown): rawYear is number {
  return typeof rawYear === 'number' && Number.isInteger(rawYear) && SELECTABLE_TAX_YEARS.includes(rawYear)
}

/**
 * Unmounts buried stack routes so duplicate back buttons/inputs under `display: none` cannot match
 * accessibility queries, while keeping `CockpitHome` mounted behind an open Sheet route.
 */
export function renderActiveStackRoute({
  route,
  navigation,
  children,
}: {
  readonly route: { readonly key: string; readonly name: string }
  readonly navigation: { readonly getState: () => NavigationState }
  readonly children: ReactElement
}): ReactElement {
  const stackState = navigation.getState()
  const topRoute = stackState.routes[stackState.index]
  const visible =
    topRoute?.key === route.key || (route.name === 'CockpitHome' && isSheetRouteName(topRoute?.name))
  return createElement(Fragment, null, visible ? children : null)
}

/**
 * Validates a year URL param against selectable tax years, syncs ShellState to it,
 * or returns to CockpitHome if the param is invalid (without duplicating CockpitHome).
 */
export function useYearGuard(rawYear: unknown, navigation: NativeStackNavigationProp<CockpitStackParamList>): number | null {
  const { taxYear, setTaxYear } = useShellState()
  const year = isSelectableYear(rawYear) ? rawYear : null

  useEffect(() => {
    if (year === null) {
      const state = navigation.getState()
      const onlyInvalidRoot = state.routes.length === 1 && state.routes[0]?.name !== 'CockpitHome'
      if (onlyInvalidRoot) {
        navigation.replace('CockpitHome')
      } else {
        navigation.navigate('CockpitHome', undefined, { pop: true })
      }
      return
    }
    if (year !== taxYear) {
      setTaxYear(year)
    }
  }, [year, taxYear, setTaxYear, navigation])

  return year
}
