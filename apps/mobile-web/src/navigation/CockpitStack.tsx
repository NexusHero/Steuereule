import { useEffect, useState } from 'react'
import { createNativeStackNavigator, type NativeStackScreenProps } from '@react-navigation/native-stack'
import { CockpitScreen } from '../screens/cockpit/CockpitScreen'
import { useAccountSession } from '../auth/useAccountSession'
import { InterviewScreen } from '../screens/interview/InterviewScreen'
import { AccountWallScreen, pathFromAnswers } from '../screens/funnel/KontoWandScreen'
import { useShellState } from './ShellState'
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
  CapitalRoute,
  ChildrenRoute,
  CockpitMasterDataRoute,
  PartnerRoute,
  RentalRoute,
} from './CockpitDetailRoutes'
import type { CockpitStackParamList } from './routes'

const Stack = createNativeStackNavigator<CockpitStackParamList>()

type Props<T extends keyof CockpitStackParamList> = NativeStackScreenProps<CockpitStackParamList, T>

function CockpitHomeRoute({ navigation }: Props<'CockpitHome'>) {
  const { taxYear, setTaxYear, setFunnelPath, setPendingPath, switchToTab, consumeStartInterview, onOpenConfirmation } =
    useShellState()
  const { state: sessionState } = useAccountSession()
  const [redirecting, setRedirecting] = useState(() => consumeStartInterview())

  useEffect(() => {
    if (!redirecting) return
    setRedirecting(false)
    navigation.navigate('Interview', { year: taxYear })
  }, [redirecting, navigation, taxYear])

  if (redirecting) return null

  return (
    <CockpitScreen
      key={taxYear}
      taxYear={taxYear}
      isSignedIn={sessionState.status === 'signed-in'}
      onYearChange={setTaxYear}
      onOpenInterview={() => navigation.navigate('Interview', { year: taxYear })}
      onOpenAssessment={() => navigation.navigate('Assessment', { year: taxYear })}
      onOpenCapital={() => navigation.navigate('Capital', { year: taxYear })}
      onOpenRental={() => navigation.navigate('Rental', { year: taxYear })}
      onOpenKinder={() => navigation.navigate('Children', { year: taxYear })}
      onOpenOwlMode={() => switchToTab('Owl')}
      onOpenMasterData={() => navigation.navigate('CockpitMasterData', { year: taxYear })}
      onOpenSubmission={(year) => navigation.navigate('Submission', { year })}
      onOpenTile={(tile, revisit) => navigateToTileRoute(navigation, taxYear, tile, revisit)}
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
  const { setFunnelPath, setPendingPath } = useShellState()
  if (year === null) return null

  return (
    <InterviewScreen
      taxYear={year}
      onDone={(answers) => {
        const path = pathFromAnswers(answers)
        setFunnelPath(path)
        navigation.navigate('CockpitHome', undefined, { pop: true })
        setPendingPath(path)
      }}
    />
  )
}

function AccountWallRoute({ navigation }: Props<'AccountWall'>) {
  const { funnelPath, onRegister, onLogin } = useShellState()
  return (
    <AccountWallScreen
      path={funnelPath}
      onRegister={onRegister}
      onLogin={onLogin}
      onLater={() => navigation.navigate('CockpitHome', undefined, { pop: true })}
    />
  )
}

export function CockpitStack() {
  return (
    <Stack.Navigator initialRouteName="CockpitHome" screenOptions={{ headerShown: false }} screenLayout={renderActiveStackRoute}>
      <Stack.Screen name="CockpitHome" component={CockpitHomeRoute} />
      <Stack.Screen name="Interview" component={InterviewRoute} />
      <Stack.Screen name="AccountWall" component={AccountWallRoute} />
      <Stack.Screen name="Submission" component={SubmissionRoute} />
      <Stack.Screen name="Plausibility" component={PlausibilityRoute} />
      <Stack.Screen name="FilingTypeComparison" component={FilingTypeComparisonRoute} />
      <Stack.Screen name="Assessment" component={AssessmentRoute} />
      <Stack.Screen name="CockpitMasterData" component={CockpitMasterDataRoute} />
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
