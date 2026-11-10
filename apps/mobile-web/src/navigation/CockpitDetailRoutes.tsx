import { useEffect } from 'react'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { AssessmentScreen } from '../screens/assessment/AssessmentScreen'
import { CapitalScreen } from '../screens/capital/CapitalScreen'
import { RentalScreen } from '../screens/rental/RentalScreen'
import { ChildrenScreen } from '../screens/children/ChildrenScreen'
import { MasterDataScreen } from '../screens/master-data/MasterDataScreen'
import { LstbScreen } from '../screens/lstb/LstbScreen'
import { WorkdaysScreen } from '../screens/workdays/WorkdaysScreen'
import { useShellState } from './ShellState'
import { RequiresAccount } from './RequiresAccount'
import { CockpitSheet } from './CockpitSheet'
import { useYearGuard } from './guards'
import type { CockpitStackParamList, PartnerAreaParam } from './routes'

const PARTNER_AREAS: readonly PartnerAreaParam[] = ['lstb', 'arbeitsweg']

type Props<T extends keyof CockpitStackParamList> = NativeStackScreenProps<CockpitStackParamList, T>

export function AssessmentRoute({ navigation, route }: Props<'Assessment'>) {
  const year = useYearGuard(route.params?.year, navigation)
  if (year === null) return null
  const home = () => navigation.navigate('CockpitHome', undefined, { pop: true })
  return (
    <RequiresAccount>
      <AssessmentScreen taxYear={year} onDone={home} onBack={home} />
    </RequiresAccount>
  )
}

export function CapitalRoute({ navigation, route }: Props<'Capital'>) {
  const year = useYearGuard(route.params?.year, navigation)
  if (year === null) return null
  const home = () => navigation.navigate('CockpitHome', undefined, { pop: true })
  return (
    <RequiresAccount>
      <CockpitSheet navigation={navigation}>
        <CapitalScreen taxYear={year} onDone={home} onBack={home} />
      </CockpitSheet>
    </RequiresAccount>
  )
}

export function RentalRoute({ navigation, route }: Props<'Rental'>) {
  const year = useYearGuard(route.params?.year, navigation)
  if (year === null) return null
  const home = () => navigation.navigate('CockpitHome', undefined, { pop: true })
  return (
    <RequiresAccount>
      <CockpitSheet navigation={navigation}>
        <RentalScreen taxYear={year} onDone={home} onBack={home} />
      </CockpitSheet>
    </RequiresAccount>
  )
}

export function ChildrenRoute({ navigation, route }: Props<'Children'>) {
  const year = useYearGuard(route.params?.year, navigation)
  if (year === null) return null
  const home = () => navigation.navigate('CockpitHome', undefined, { pop: true })
  return (
    <RequiresAccount>
      <CockpitSheet navigation={navigation}>
        <ChildrenScreen taxYear={year} onDone={home} onBack={home} />
      </CockpitSheet>
    </RequiresAccount>
  )
}

export function CockpitMasterDataRoute({ navigation, route }: Props<'CockpitMasterData'>) {
  const year = useYearGuard(route.params?.year, navigation)
  const { setPartner } = useShellState()
  if (year === null) return null
  return (
    <RequiresAccount>
      <MasterDataScreen
        taxYear={year}
        onBack={() => navigation.navigate('CockpitHome', undefined, { pop: true })}
        onRecordPartner={(area, name) => {
          setPartner({ area, name })
          navigation.navigate('Partner', { year, area })
        }}
      />
    </RequiresAccount>
  )
}

export function PartnerRoute({ navigation, route }: Props<'Partner'>) {
  const year = useYearGuard(route.params?.year, navigation)
  const { partner, setTaxYear } = useShellState()
  const rawArea = route.params?.area
  const validArea = PARTNER_AREAS.includes(rawArea) ? rawArea : null
  const activePartner = partner && validArea !== null && partner.area === validArea ? partner : null

  useEffect(() => {
    if (year !== null && activePartner === null) {
      navigation.replace('CockpitMasterData', { year })
    }
  }, [year, activePartner, navigation])

  if (year === null || activePartner === null) return null
  const cameFromMasterData = navigation.getState().routes.some((r) => r.name === 'CockpitMasterData')
  const closePartner = () =>
    cameFromMasterData
      ? navigation.navigate('CockpitMasterData', { year }, { pop: true })
      : navigation.navigate('CockpitHome', undefined, { pop: true })

  return (
    <RequiresAccount>
      <CockpitSheet navigation={navigation}>
        {activePartner.area === 'lstb' ? (
          <LstbScreen
            taxYear={year}
            partnerName={activePartner.name}
            onSwitchTaxYear={(nextYear) => {
              setTaxYear(nextYear)
              navigation.setParams({ year: nextYear })
            }}
            onDone={closePartner}
            onBack={closePartner}
          />
        ) : (
          <WorkdaysScreen taxYear={year} partnerName={activePartner.name} onDone={closePartner} onBack={closePartner} />
        )}
      </CockpitSheet>
    </RequiresAccount>
  )
}
