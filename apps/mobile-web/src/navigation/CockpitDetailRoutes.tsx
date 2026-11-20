import { useEffect } from 'react'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { AssessmentScreen } from '../screens/assessment/AssessmentScreen'
import { CapitalScreen } from '../screens/capital/CapitalScreen'
import { RentalScreen } from '../screens/rental/RentalScreen'
import { ChildrenScreen } from '../screens/children/ChildrenScreen'
import { MasterDataScreen } from '../screens/master-data/MasterDataScreen'
import { LstbScreen } from '../screens/lstb/LstbScreen'
import { WorkdaysScreen } from '../screens/workdays/WorkdaysScreen'
import { CrossBorderScreen } from '../screens/cross-border/CrossBorderScreen'
import { PensionerScreen } from '../screens/pension/PensionerScreen'
import { BusinessScreen } from '../screens/business/BusinessScreen'
import { OfficialFormScreen } from '../screens/printout/OfficialFormScreen'
import type { Screen } from '@steuereule/core'
import { useShellState } from './ShellState'
import { RequiresAccount } from './RequiresAccount'
import { CockpitSheet } from './CockpitSheet'
import { useYearGuard } from './guards'
import type { CockpitStackParamList, PartnerAreaParam } from './routes'

const PARTNER_AREAS: readonly PartnerAreaParam[] = ['lstb', 'arbeitsweg', 'schweiz', 'rente']

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
        ) : activePartner.area === 'rente' ? (
          <PensionerScreen taxYear={year} partnerName={activePartner.name} onDone={closePartner} onBack={closePartner} />
        ) : activePartner.area === 'schweiz' ? (
          <CrossBorderScreen taxYear={year} partnerName={activePartner.name} onDone={closePartner} onBack={closePartner} />
        ) : (
          <WorkdaysScreen taxYear={year} partnerName={activePartner.name} onDone={closePartner} onBack={closePartner} />
        )}
      </CockpitSheet>
    </RequiresAccount>
  )
}

type FormNavigation = Props<'OfficialForm'>['navigation']

/** Opens where a field of the official form is entered: its mask, or for Person B the partner area. */
function openMaskFor(navigation: FormNavigation, screen: Screen, person: 'A' | 'B', year: number): void {
  const partnerArea: PartnerAreaParam | null =
    person !== 'B' ? null : screen === 'lstb' ? 'lstb' : screen === 'commute' ? 'arbeitsweg' : screen === 'chLohnausweis' ? 'schweiz' : screen === 'rente' ? 'rente' : null
  if (partnerArea) return navigation.navigate('Partner', { year, area: partnerArea })
  switch (screen) {
    case 'lstb':
      return navigation.navigate('Lstb', { year })
    case 'commute':
      return navigation.navigate('Workdays', { year })
    case 'chLohnausweis':
      return navigation.navigate('CrossBorder', { year })
    case 'rente':
      return navigation.navigate('Pension', { year })
    case 'kapital':
      return navigation.navigate('Capital', { year })
    case 'vermietung':
      return navigation.navigate('Rental', { year })
    case 'kind':
      return navigation.navigate('Children', { year })
    case 'stammdaten':
    case 'profil':
    case 'kopplung':
      return navigation.navigate('CockpitMasterData', { year })
    case 'interview':
      return navigation.navigate('Interview', { year })
    case 'assessment':
      return navigation.navigate('Assessment', { year })
  }
}

export function OfficialFormRoute({ navigation, route }: Props<'OfficialForm'>) {
  const year = useYearGuard(route.params?.year, navigation)
  if (year === null) return null
  const back = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('CockpitHome', undefined, { pop: true }))
  return (
    <RequiresAccount>
      <OfficialFormScreen
        taxYear={year}
        initialForm={route.params?.form}
        onBack={back}
        onInspectField={(screen, _field, person) => openMaskFor(navigation, screen, person ?? 'A', year)}
      />
    </RequiresAccount>
  )
}

export function BusinessRoute({ navigation, route }: Props<'Business'>) {
  const year = useYearGuard(route.params?.year, navigation)
  if (year === null) return null
  const person = route.params?.person === 'B' ? 'B' : 'A'
  // ADR-0101 §22: which business of the person; the first unless the link names another.
  const business = Number.isSafeInteger(Number(route.params?.betrieb)) && Number(route.params?.betrieb) > 1 ? Number(route.params?.betrieb) : 1
  const page = route.params?.page
  const home = () => navigation.navigate('CockpitHome', undefined, { pop: true })
  const own: { person?: 'B'; betrieb?: string } = { ...(person === 'B' ? { person: 'B' as const } : {}), ...(business > 1 ? { betrieb: String(business) } : {}) }
  return (
    <RequiresAccount>
      <BusinessScreen
        taxYear={year}
        person={person}
        business={business}
        page={page}
        payment={route.params?.zahlung}
        onOpenPage={(next) => navigation.navigate('Business', { year, ...(next ? { page: next } : {}), ...own })}
        onBack={() => (page ? navigation.navigate('Business', { year, ...own }, { pop: true }) : home())}
        onChangePerson={(next) => navigation.navigate('Business', { year, ...(next === 'B' ? { person: next } : {}) })}
        onChangeBusiness={(next) => navigation.navigate('Business', { year, ...(person === 'B' ? { person } : {}), ...(next > 1 ? { betrieb: String(next) } : {}) })}
      />
    </RequiresAccount>
  )
}
