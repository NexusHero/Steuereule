import { useEffect } from 'react'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { LstbScreen } from '../screens/lstb/LstbScreen'
import { PensionerScreen } from '../screens/pension/PensionerScreen'
import { CrossBorderScreen } from '../screens/cross-border/CrossBorderScreen'
import { CatalogScreen } from '../screens/catalog/CatalogScreen'
import { WorkdaysScreen } from '../screens/workdays/WorkdaysScreen'
import { PlausibilityScreen } from '../screens/plausibility/PlausibilityScreen'
import { SubmissionScreen } from '../screens/submission/SubmissionScreen'
import { FilingTypeComparisonScreen } from '../screens/filing-type-comparison/FilingTypeComparisonScreen'
import { tileById, type TileDefinition } from '../screens/cockpit/tiles'
import { useShellState } from './ShellState'
import { RequiresAccount } from './RequiresAccount'
import { useYearGuard } from './guards'
import type { CatalogEntryParam, CockpitStackParamList } from './routes'

const CATALOG_ENTRIES: readonly CatalogEntryParam[] = ['lebenslagen', 'einkuenfte', 'sonderausgaben']

type Props<T extends keyof CockpitStackParamList> = NativeStackScreenProps<CockpitStackParamList, T>

export function navigateToTileRoute(
  navigation: {
    readonly navigate: <RouteName extends keyof CockpitStackParamList>(
      screen: RouteName,
      params: CockpitStackParamList[RouteName],
    ) => void
  },
  year: number,
  tile: TileDefinition,
  revisit: boolean,
): void {
  const r = tile.route
  switch (r.screen) {
    case 'Lstb':
      navigation.navigate('Lstb', { year })
      return
    case 'CrossBorder':
      navigation.navigate('CrossBorder', { year })
      return
    case 'Pension':
      navigation.navigate('Pension', { year })
      return
    case 'Catalog':
      navigation.navigate('Catalog', revisit ? { year, entry: r.entry, revisit: true } : { year, entry: r.entry })
      return
    case 'Workdays':
      navigation.navigate('Workdays', { year })
      return
    case 'Capital':
      navigation.navigate('Capital', { year })
      return
    case 'Rental':
      navigation.navigate('Rental', { year })
      return
    case 'Children':
      navigation.navigate('Children', { year })
      return
  }
}

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

export function SubmissionRoute({ navigation, route }: Props<'Submission'>) {
  const year = useYearGuard(route.params?.year, navigation)
  const { onOpenPrintout } = useShellState()
  if (year === null) return null

  const goHome = () => {
    const hasHome = navigation.getState().routes.some((r) => r.name === 'CockpitHome')
    if (hasHome) navigation.navigate('CockpitHome', undefined, { pop: true })
    else navigation.replace('CockpitHome')
  }

  return (
    <RequiresAccount>
      <SubmissionScreen
        taxYear={year}
        onBack={goHome}
        onOpenTile={(tileId, revisit) => navigateToTileRoute(navigation, year, tileById(tileId), revisit)}
        onOpenPrintout={(targetYear) => onOpenPrintout?.(targetYear)}
      />
    </RequiresAccount>
  )
}
