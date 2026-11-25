import { useEffect, useState } from 'react'
import { createNativeStackNavigator, type NativeStackScreenProps } from '@react-navigation/native-stack'
import { CockpitScreen } from '../screens/cockpit/CockpitScreen'
import { useAccountSession } from '../auth/useAccountSession'
import { InterviewScreen } from '../screens/interview/InterviewScreen'
import { LeaveGuardProvider } from '../screens/shared/leaveGuard'
import { useRemovalGuard } from './useRemovalGuard'
import { StromScreen } from '../screens/strom/StromScreen'
import { slugOf } from '../screens/strom/stromPlan'
import { AccountWallScreen, pathFromAnswers } from '../screens/funnel/KontoWandScreen'
import { readPendingVerification } from '../auth/pendingVerification'
import { useShellState } from './ShellState'
import { RequiresAccount } from './RequiresAccount'
import { renderActiveStackRoute, useYearGuard } from './guards'
import {
  CatalogRoute,
  CrossBorderRoute,
  FilingTypeComparisonRoute,
  LstbRoute,
  PensionRoute,
  PlausibilityRoute,
  SubmissionRoute,
  WorkdaysRoute,
  navigateToTileRoute,
} from './CockpitTunnelRoutes'
import {
  AssessmentRoute,
  BusinessRoute,
  CapitalRoute,
  ChildrenRoute,
  CockpitMasterDataRoute,
  OfficialFormRoute,
  PartnerRoute,
  RentalRoute,
} from './CockpitDetailRoutes'
import type { CockpitStackParamList } from './routes'

const Stack = createNativeStackNavigator<CockpitStackParamList>()

type Props<T extends keyof CockpitStackParamList> = NativeStackScreenProps<CockpitStackParamList, T>

function CockpitHomeRoute({ navigation }: Props<'CockpitHome'>) {
  const { taxYear, setTaxYear, setFunnelPath, setPendingPath, setPartner, consumeStartInterview, onOpenConfirmation, switchToTab } =
    useShellState()
  const { state: sessionState } = useAccountSession()
  const [redirecting, setRedirecting] = useState(() => consumeStartInterview())

  useEffect(() => {
    if (!redirecting) return
    setRedirecting(false)
    navigation.navigate('Strom', { year: taxYear, step: 'basis' })
  }, [redirecting, navigation, taxYear])

  if (redirecting) return null

  return (
    <CockpitScreen
      key={taxYear}
      taxYear={taxYear}
      isSignedIn={sessionState.status === 'signed-in'}
      sessionPending={sessionState.status === 'loading'}
      onYearChange={setTaxYear}
      onOpenInterview={() => navigation.navigate('Strom', { year: taxYear, step: 'basis' })}
      onOpenStrom={(step) => navigation.navigate('Strom', { year: taxYear, step: slugOf(step) })}
      onOpenAssessment={() => navigation.navigate('Assessment', { year: taxYear })}
      onOpenCapital={() => navigation.navigate('Capital', { year: taxYear })}
      onOpenRental={() => navigation.navigate('Rental', { year: taxYear })}
      onOpenKinder={() => navigation.navigate('Children', { year: taxYear })}
      onOpenOfficialForm={(year) => navigation.navigate('OfficialForm', { year })}
      onOpenMasterData={() => navigation.navigate('CockpitMasterData', { year: taxYear })}
      onOpenReceipts={() => switchToTab('Receipts')}
      onOpenSubmission={(year) => navigation.navigate('Submission', { year })}
      onOpenElsterHelp={(year) => navigation.navigate('Business', { year, page: 'elster' })}
      onOpenTile={(tile, revisit) => navigateToTileRoute(navigation, taxYear, tile, revisit)}
      onOpenPartner={(area, name) => {
        setPartner({ area, name })
        navigation.navigate('Partner', { year: taxYear, area })
      }}
      onContinuePath={(path) => {
        setFunnelPath(path)
        setPendingPath(path)
      }}
      {...(onOpenConfirmation ? { onOpenConfirmation } : {})}
    />
  )
}

function InterviewRoute({ navigation, route }: Props<'Interview'>) {
  const year = useYearGuard(route.params?.year, navigation)
  const { setFunnelPath, setPendingPath, setTaxYear } = useShellState()
  if (year === null) return null

  return (
    <InterviewScreen
      key={year}
      taxYear={year}
      onChangeYear={(nextYear) => {
        // The route param is the source of truth (useYearGuard), so both move together.
        setTaxYear(nextYear)
        navigation.setParams({ year: nextYear })
      }}
      onDone={(answers) => {
        const path = pathFromAnswers(answers)
        // The finished interview leaves the history before the next mask opens: Back from that mask
        // then leads to the cockpit, not into the interview that forwards again (#450 Teil 4).
        if (navigation.canGoBack()) navigation.pop()
        setFunnelPath(path)
        setPendingPath(path)
      }}
    />
  )
}

function StromRoute({ navigation, route }: Props<'Strom'>) {
  // NM-05: „Später weiter“ and the browser's back wait for the mask's pending saves, as the sheets do.
  const guard = useRemovalGuard(navigation)
  const year = useYearGuard(route.params?.year, navigation)
  const { setFunnelPath, setPendingPath } = useShellState()
  const { state: sessionState } = useAccountSession()
  if (year === null || sessionState.status === 'loading') return null
  const screen = (
    <StromScreen
      key={year}
      taxYear={year}
      slug={route.params?.step}
      isSignedIn={sessionState.status === 'signed-in'}
      onGo={(step) => navigation.navigate('Strom', { year, step: slugOf(step) })}
      onExit={() => navigation.navigate('CockpitHome', undefined, { pop: true })}
      onOpenSubmission={() => navigation.navigate('Submission', { year })}
      onGuestBasisDone={(path) => {
        // As after the interview: a guest goes on to the account wall (the masks need an account).
        navigation.navigate('CockpitHome', undefined, { pop: true })
        setFunnelPath(path)
        setPendingPath(path)
      }}
    />
  )
  const guarded = <LeaveGuardProvider host={guard}>{screen}</LeaveGuardProvider>
  // Only the basis page is open to guests; every other step needs an account (as the masks do).
  return route.params?.step === 'basis' ? guarded : <RequiresAccount>{guarded}</RequiresAccount>
}

function AccountWallRoute({ navigation }: Props<'AccountWall'>) {
  const { funnelPath, onRegister, onLogin } = useShellState()
  return (
    <AccountWallScreen
      path={funnelPath}
      onRegister={onRegister}
      onLogin={onLogin}
      onLater={() => navigation.navigate('CockpitHome', undefined, { pop: true })}
      pendingVerificationEmail={readPendingVerification()}
    />
  )
}

export function CockpitStack() {
  return (
    <Stack.Navigator initialRouteName="CockpitHome" screenOptions={{ headerShown: false }} screenLayout={renderActiveStackRoute}>
      <Stack.Screen name="CockpitHome" component={CockpitHomeRoute} />
      <Stack.Screen name="Interview" component={InterviewRoute} />
      <Stack.Screen name="Strom" component={StromRoute} getId={({ params }) => `${params.year}-${params.step}`} />
      <Stack.Screen name="AccountWall" component={AccountWallRoute} />
      <Stack.Screen name="Submission" component={SubmissionRoute} />
      <Stack.Screen name="Plausibility" component={PlausibilityRoute} />
      <Stack.Screen name="FilingTypeComparison" component={FilingTypeComparisonRoute} />
      <Stack.Screen name="Assessment" component={AssessmentRoute} />
      <Stack.Screen name="CockpitMasterData" component={CockpitMasterDataRoute} />
      <Stack.Screen name="OfficialForm" component={OfficialFormRoute} />
      <Stack.Screen name="Business" component={BusinessRoute} getId={({ params }) => `${params.year}-${params.page ?? ''}-${params.person ?? 'A'}`} />
      <Stack.Group screenOptions={{ presentation: 'transparentModal', animation: 'slide_from_bottom' }}>
        <Stack.Screen name="Lstb" component={LstbRoute} />
        <Stack.Screen name="Pension" component={PensionRoute} />
        <Stack.Screen name="CrossBorder" component={CrossBorderRoute} />
        <Stack.Screen name="Catalog" component={CatalogRoute} getId={({ params }) => `${params.year}-${params.entry}`} />
        <Stack.Screen name="Workdays" component={WorkdaysRoute} />
        <Stack.Screen name="Capital" component={CapitalRoute} />
        <Stack.Screen name="Rental" component={RentalRoute} />
        <Stack.Screen name="Children" component={ChildrenRoute} />
        <Stack.Screen name="Partner" component={PartnerRoute} />
      </Stack.Group>
    </Stack.Navigator>
  )
}
