import { createNativeStackNavigator, type NativeStackScreenProps } from '@react-navigation/native-stack'
import { useAccountSession } from '../auth/useAccountSession'
import { HistoryScreen } from '../screens/history/HistoryScreen'
import { HistoryYearScreen } from '../screens/history/HistoryYearScreen'
import { HistoryDevelopmentScreen } from '../screens/history/HistoryDevelopmentScreen'
import { HistoryDocumentsScreen } from '../screens/history/HistoryDocumentsScreen'
import { useShellState } from './ShellState'
import { guardedStackRoute } from './guardedRoute'
import type { HistoryStackParamList } from './routes'

const Stack = createNativeStackNavigator<HistoryStackParamList>()

type Props<T extends keyof HistoryStackParamList> = NativeStackScreenProps<HistoryStackParamList, T>

function useIsGuest(): boolean {
  return useAccountSession().state.status === 'signed-out'
}

function HistoryHomeRoute({ navigation }: Props<'HistoryHome'>) {
  const { taxYear, setTaxYear, switchToTab, openCockpitScreen, onRegister, onLogin } = useShellState()
  return (
    <HistoryScreen
      isGuest={useIsGuest()}
      openYear={taxYear}
      onRegister={onRegister}
      onLogin={onLogin}
      onOpenYearDetail={(year) => navigation.navigate('HistoryYear', { year })}
      onOpenDevelopment={() => navigation.navigate('HistoryDevelopment')}
      onOpenDrafts={() => switchToTab('Owl')}
      onOpenDocuments={() => navigation.navigate('HistoryDocuments')}
      onStartYear={(year) => {
        setTaxYear(year)
        openCockpitScreen('CockpitHome')
      }}
    />
  )
}

function HistoryYearRoute({ navigation, route }: Props<'HistoryYear'>) {
  const { setTaxYear, openCockpitScreen, switchToTab, onRegister, onLogin } = useShellState()
  return (
    <HistoryYearScreen
      year={route.params.year}
      isGuest={useIsGuest()}
      onBack={() => navigation.navigate('HistoryHome', undefined, { pop: true })}
      onRegister={onRegister}
      onLogin={onLogin}
      onOpenYear={(year) => {
        setTaxYear(year)
        openCockpitScreen('CockpitHome')
      }}
      onPrepareAppeal={(year) => {
        setTaxYear(year)
        openCockpitScreen('Assessment', { year })
      }}
      onOpenReceipts={() => {
        setTaxYear(route.params.year)
        switchToTab('Receipts')
      }}
    />
  )
}

function HistoryDevelopmentRoute({ navigation }: Props<'HistoryDevelopment'>) {
  const { taxYear, switchToTab, onRegister, onLogin } = useShellState()
  return (
    <HistoryDevelopmentScreen
      isGuest={useIsGuest()}
      openYear={taxYear}
      onBack={() => navigation.navigate('HistoryHome', undefined, { pop: true })}
      onRegister={onRegister}
      onLogin={onLogin}
      onOpenYearDetail={(year) => navigation.navigate('HistoryYear', { year })}
      onOpenDrafts={() => switchToTab('Owl')}
    />
  )
}

function HistoryDocumentsRoute({ navigation }: Props<'HistoryDocuments'>) {
  const { onRegister, onLogin } = useShellState()
  return <HistoryDocumentsScreen isGuest={useIsGuest()} onBack={() => navigation.navigate('HistoryHome', undefined, { pop: true })} onRegister={onRegister} onLogin={onLogin} />
}

/** The tab „Verlauf“ (ADR-0098 §1): the timeline, and one tap away a year's page, the development or the Unterlagen (ADR-0099 §9). */
export function HistoryStack() {
  return (
    <Stack.Navigator initialRouteName="HistoryHome" screenOptions={{ headerShown: false }} screenLayout={guardedStackRoute}>
      <Stack.Screen name="HistoryHome" component={HistoryHomeRoute} />
      <Stack.Screen name="HistoryYear" component={HistoryYearRoute} />
      <Stack.Screen name="HistoryDevelopment" component={HistoryDevelopmentRoute} />
      <Stack.Screen name="HistoryDocuments" component={HistoryDocumentsRoute} />
    </Stack.Navigator>
  )
}
