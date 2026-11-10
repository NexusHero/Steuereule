import { useEffect } from 'react'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { LstbScreen } from '../screens/lstb/LstbScreen'
import { PensionerScreen } from '../screens/pension/PensionerScreen'
import { CrossBorderScreen } from '../screens/cross-border/CrossBorderScreen'
import { CatalogScreen } from '../screens/catalog/CatalogScreen'
import { WorkdaysScreen } from '../screens/workdays/WorkdaysScreen'
import { PlausibilityScreen } from '../screens/plausibility/PlausibilityScreen'
import { FilingTypeComparisonScreen } from '../screens/filing-type-comparison/FilingTypeComparisonScreen'
import { useShellState } from './ShellState'
import { RequiresAccount } from './RequiresAccount'
import { useYearGuard } from './guards'
import type { CatalogEntryParam, CockpitStackParamList } from './routes'

const CATALOG_ENTRIES: readonly CatalogEntryParam[] = ['lebenslagen', 'einkuenfte', 'sonderausgaben']

type Props<T extends keyof CockpitStackParamList> = NativeStackScreenProps<CockpitStackParamList, T>

export function LstbRoute({ navigation, route }: Props<'Lstb'>) {
  const year = useYearGuard(route.params?.year, navigation)
  const { setTaxYear } = useShellState()
  if (year === null) return null
  const home = () => navigation.navigate('CockpitHome', undefined, { pop: true })

  return (
    <RequiresAccount>
      <LstbScreen
        taxYear={year}
        onSwitchTaxYear={(nextYear) => {
          setTaxYear(nextYear)
          navigation.setParams({ year: nextYear })
        }}
        onDone={home}
        onBack={home}
      />
    </RequiresAccount>
  )
}

export function PensionRoute({ navigation, route }: Props<'Pension'>) {
  const year = useYearGuard(route.params?.year, navigation)
  if (year === null) return null
  const home = () => navigation.navigate('CockpitHome', undefined, { pop: true })
  return (
    <RequiresAccount>
      <PensionerScreen taxYear={year} onDone={home} onBack={home} />
    </RequiresAccount>
  )
}

export function CrossBorderRoute({ navigation, route }: Props<'CrossBorder'>) {
  const year = useYearGuard(route.params?.year, navigation)
  if (year === null) return null
  const home = () => navigation.navigate('CockpitHome', undefined, { pop: true })
  return (
    <RequiresAccount>
      <CrossBorderScreen taxYear={year} onDone={home} onBack={home} />
    </RequiresAccount>
  )
}

export function CatalogRoute({ navigation, route }: Props<'Catalog'>) {
  const year = useYearGuard(route.params?.year, navigation)
  const rawEntry = route.params?.entry
  const validEntry = CATALOG_ENTRIES.includes(rawEntry) ? rawEntry : null

  useEffect(() => {
    if (year !== null && validEntry === null) {
      navigation.navigate('CockpitHome', undefined, { pop: true })
    }
  }, [year, validEntry, navigation])

  if (year === null || validEntry === null) return null
  const revisit = Boolean(route.params?.revisit)
  const home = () => navigation.navigate('CockpitHome', undefined, { pop: true })

  return (
    <RequiresAccount>
      <CatalogScreen key={`${year}-${validEntry}`} taxYear={year} entry={validEntry} revisit={revisit} onDone={home} onBack={home} />
    </RequiresAccount>
  )
}

export function WorkdaysRoute({ navigation, route }: Props<'Workdays'>) {
  const year = useYearGuard(route.params?.year, navigation)
  if (year === null) return null
  const home = () => navigation.navigate('CockpitHome', undefined, { pop: true })
  return (
    <RequiresAccount>
      <WorkdaysScreen taxYear={year} onDone={home} onBack={home} />
    </RequiresAccount>
  )
}

export function PlausibilityRoute({ navigation, route }: Props<'Plausibility'>) {
  const year = useYearGuard(route.params?.year, navigation)
  if (year === null) return null
  return (
    <RequiresAccount>
      <PlausibilityScreen
        taxYear={year}
        onBack={() => navigation.navigate('CockpitHome', undefined, { pop: true })}
        onDone={() => navigation.navigate('FilingTypeComparison', { year })}
      />
    </RequiresAccount>
  )
}

export function FilingTypeComparisonRoute({ navigation, route }: Props<'FilingTypeComparison'>) {
  const year = useYearGuard(route.params?.year, navigation)
  if (year === null) return null
  return (
    <RequiresAccount>
      <FilingTypeComparisonScreen
        taxYear={year}
        onBack={() => navigation.navigate('Plausibility', { year }, { pop: true })}
        onDone={() => navigation.navigate('CockpitHome', undefined, { pop: true })}
      />
    </RequiresAccount>
  )
}
