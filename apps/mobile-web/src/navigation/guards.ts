import { useEffect } from 'react'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { selectableTaxYears } from '../config/taxYear'
import { useShellState } from './ShellState'
import type { CockpitStackParamList } from './routes'

export function isSelectableYear(rawYear: unknown): rawYear is number {
  return typeof rawYear === 'number' && Number.isInteger(rawYear) && selectableTaxYears().includes(rawYear)
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
