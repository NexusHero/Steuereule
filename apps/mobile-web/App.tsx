import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { I18nextProvider, useTranslation } from 'react-i18next'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NavigationContainer, useLinkTo } from '@react-navigation/native'
import { createNativeStackNavigator, type NativeStackScreenProps } from '@react-navigation/native-stack'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ThemeProvider, useBreakpoint } from '@steuereule/ui'
import { configureApiClient } from '@steuereule/api-client'
import { createAppI18n } from './src/i18n/app-i18n'
import { APP_NS } from './src/i18n/resources'
import { createAppAuthClient } from './src/auth/auth-client'
import { AuthClientProvider } from './src/auth/AuthClientProvider'
import { APP_QUERY_DEFAULTS } from './src/query-client'
import { SplashScreen } from './src/screens/SplashScreen'
import { LoginScreen } from './src/screens/LoginScreen'
import { RegistrationScreen } from './src/screens/RegistrationScreen'
import { OnboardingScreen } from './src/screens/OnboardingScreen'
import { LstbScreen } from './src/screens/lstb/LstbScreen'
import { CatalogScreen } from './src/screens/catalog/CatalogScreen'
import { CapitalScreen } from './src/screens/capital/CapitalScreen'
import { RentalScreen } from './src/screens/rental/RentalScreen'
import { CrossBorderScreen } from './src/screens/cross-border/CrossBorderScreen'
import { PensionerScreen } from './src/screens/pension/PensionerScreen'
import { DeviceScreen } from './src/screens/device/DeviceScreen'
import { LegalScreen } from './src/screens/legal/LegalScreen'
import { MasterDataScreen } from './src/screens/master-data/MasterDataScreen'
import { PrintoutScreen } from './src/screens/printout/PrintoutScreen'
import { usePlausibility } from './src/screens/plausibility/usePlausibility'
import { LoadingState } from './src/screens/shared/ScreenState'
import { ConfirmationScreen, type ConfirmationForm } from './src/screens/confirmation/ConfirmationScreen'
import { OauthConsentScreen } from './src/screens/oauth/OauthConsentScreen'
import { ChildrenScreen } from './src/screens/children/ChildrenScreen'
import { CURRENT_TAX_YEAR } from './src/config/taxYear'
import {
  rememberPendingPath,
  rememberReturnTo,
  rememberedPendingPath,
  rememberedReturnTo,
} from './src/screens/funnel/sessionMemory'
import { CopilotBridgeProvider } from './src/screens/advisor/CopilotBridgeProvider'
import { operatorFromEnv, LEGAL_PAGES } from './src/screens/legal/texts'
import { useAccountSession } from './src/auth/useAccountSession'
import { followNativeAppFocus } from './src/app-focus'
import { viewAfterInterview } from './src/screens/funnel/afterTheInterview'
import type { RootStackParamList } from './src/navigation/routes'
import { linking } from './src/navigation/linking'
import { ShellStateProvider, useShellState } from './src/navigation/ShellState'
import { SubmissionGateProvider, useSubmissionGate } from './src/navigation/SubmissionGateContext'
import { AppTabs } from './src/navigation/AppTabs'

const i18n = createAppI18n('de')
const queryClient = new QueryClient({ defaultOptions: APP_QUERY_DEFAULTS })
followNativeAppFocus()

const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000'
configureApiClient({ baseUrl: apiBaseUrl })

const authClient = createAppAuthClient(apiBaseUrl)

const RootStack = createNativeStackNavigator<RootStackParamList>()

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <ThemeProvider mode="light">
            <AuthClientProvider client={authClient}>
              <SubmissionGateProvider>
                <View style={{ flex: 1 }}>
                  <NavigationContainer linking={linking}>
                    <RootStack.Navigator screenOptions={{ headerShown: false }}>
                      <RootStack.Screen name="Splash" component={SplashRoute} />
                      <RootStack.Screen name="Login" component={LoginRoute} />
                      <RootStack.Screen name="Registration" component={RegistrationRoute} />
                      <RootStack.Screen name="Onboarding" component={OnboardingRoute} />
                      <RootStack.Screen name="App" component={AppRoute} />
                      <RootStack.Screen name="Device" component={DeviceRoute} />
                      <RootStack.Screen name="Legal" component={LegalRoute} />
                      <RootStack.Screen name="Printout" component={PrintoutRoute} />
                      <RootStack.Screen name="Confirmation" component={ConfirmationRoute} />
                      <RootStack.Screen name="OauthConsent" component={OauthConsentRoute} />
                    </RootStack.Navigator>
                  </NavigationContainer>
                  <StatusBar style="dark" />
                </View>
              </SubmissionGateProvider>
            </AuthClientProvider>
          </ThemeProvider>
        </I18nextProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  )
}

function SplashRoute({ navigation }: NativeStackScreenProps<RootStackParamList, 'Splash'>) {
  return <SplashScreen onAdvance={() => navigation.replace('Login')} />
}

function LoginRoute({ navigation }: NativeStackScreenProps<RootStackParamList, 'Login'>) {
  return (
    <LoginScreen
      onDone={() => navigation.replace('App')}
      onGuest={() => navigation.replace('App', { start: 'interview' })}
      onRegister={() => navigation.replace('Registration')}
      onLegal={(page) => navigation.navigate('Legal', { page })}
    />
  )
}

function RegistrationRoute({ navigation }: NativeStackScreenProps<RootStackParamList, 'Registration'>) {
  return (
    <RegistrationScreen
      onDone={() => navigation.replace('Onboarding')}
      onLogin={() => navigation.replace('Login')}
    />
  )
}

function OnboardingRoute({ navigation }: NativeStackScreenProps<RootStackParamList, 'Onboarding'>) {
  return <OnboardingScreen onDone={() => navigation.replace('App')} />
}

const OPERATOR = operatorFromEnv({
  EXPO_PUBLIC_BETREIBER_NAME: process.env.EXPO_PUBLIC_BETREIBER_NAME,
  EXPO_PUBLIC_BETREIBER_ANSCHRIFT: process.env.EXPO_PUBLIC_BETREIBER_ANSCHRIFT,
  EXPO_PUBLIC_BETREIBER_EMAIL: process.env.EXPO_PUBLIC_BETREIBER_EMAIL,
  EXPO_PUBLIC_BETREIBER_VERTRETEN: process.env.EXPO_PUBLIC_BETREIBER_VERTRETEN,
  EXPO_PUBLIC_BETREIBER_USTID: process.env.EXPO_PUBLIC_BETREIBER_USTID,
})

function LegalRoute({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'Legal'>) {
  const page = LEGAL_PAGES.includes(route.params?.page) ? route.params.page : 'impressum'
  return (
    <LegalScreen
      page={page}
      operator={OPERATOR}
      onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.replace('Login'))}
      onPage={(next) => navigation.setParams({ page: next })}
    />
  )
}

function PrintoutRoute({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'Printout'>) {
  const [view, setView] = useState<'ausdruck' | 'stammdaten' | 'sonderausgaben' | 'kinder' | 'vermietung' | 'kapital' | 'grenzgaenger'>('ausdruck')
  const bp = useBreakpoint()
  const { t: tr } = useTranslation(APP_NS)
  const year = Number(route.params?.year)
  const validYear = Number.isInteger(year)
  const plausibility = usePlausibility(validYear ? year : CURRENT_TAX_YEAR, { enabled: validYear })
  const { areNoticesConfirmed } = useSubmissionGate()

  const gateBlocked =
    validYear &&
    (plausibility.status === 'error' ||
      (plausibility.status === 'ready' &&
        (plausibility.conflicts.length > 0 || !areNoticesConfirmed(year, plausibility.notices))))

  useEffect(() => {
    if (!validYear) {
      navigation.replace('App')
      return
    }
    if (gateBlocked) {
      navigation.replace('App', {
        screen: 'Cockpit',
        params: { screen: 'Submission', params: { year } },
      })
    }
  }, [validYear, gateBlocked, year, navigation])

  if (!validYear) return null
  if (plausibility.status === 'loading') return <LoadingState bp={bp} label={tr('abgabe.loading')} />
  if (gateBlocked || plausibility.status !== 'ready') return null
  if (view === 'stammdaten') return <MasterDataScreen onBack={() => setView('ausdruck')} />
  if (view === 'grenzgaenger') return <CrossBorderScreen taxYear={year} onDone={() => setView('ausdruck')} />
  if (view === 'kapital') return <CapitalScreen taxYear={year} onDone={() => setView('ausdruck')} onBack={() => setView('ausdruck')} />
  if (view === 'vermietung') return <RentalScreen taxYear={year} onDone={() => setView('ausdruck')} onBack={() => setView('ausdruck')} />
  if (view === 'kinder') return <ChildrenScreen taxYear={year} onDone={() => setView('ausdruck')} onBack={() => setView('ausdruck')} />
  if (view === 'sonderausgaben') {
    return <CatalogScreen entry="sonderausgaben" taxYear={year} revisit onDone={() => setView('ausdruck')} onBack={() => setView('ausdruck')} />
  }
  const payment = route.params?.payment
  return (
    <PrintoutScreen
      year={year}
      {...(payment === 'erfolg' || payment === 'abbruch' ? { payment } : {})}
      onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.replace('App'))}
      onCompleteDetails={() => setView('stammdaten')}
      onCompleteRiester={() => setView('sonderausgaben')}
      onCompleteChildren={() => setView('kinder')}
      onCompleteRental={() => setView('vermietung')}
      onCompleteCapital={() => setView('kapital')}
      onCompleteCrossBorder={() => setView('grenzgaenger')}
      onConfirm={() => navigation.navigate('Confirmation', { year: String(year) })}
    />
  )
}

function ConfirmationRoute({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'Confirmation'>) {
  const [screen, setScreen] = useState<ConfirmationForm | null>(null)
  const year = Number(route.params?.year)
  useEffect(() => {
    if (!Number.isInteger(year)) navigation.replace('App')
  }, [year, navigation])
  if (!Number.isInteger(year)) return null
  const back = () => setScreen(null)
  if (screen === 'lstb') {
    return (
      <LstbScreen
        taxYear={year}
        onDone={back}
        onBack={back}
        onSwitchTaxYear={(nextYear) => navigation.setParams({ year: String(nextYear) })}
      />
    )
  }
  if (screen === 'rente') return <PensionerScreen taxYear={year} onDone={back} onBack={back} />
  if (screen === 'kapital') return <CapitalScreen taxYear={year} onDone={back} onBack={back} />
  if (screen === 'vermietung') return <RentalScreen taxYear={year} onDone={back} onBack={back} />
  return (
    <ConfirmationScreen
      year={year}
      onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.replace('App'))}
      onOpenScreen={setScreen}
    />
  )
}

function DeviceRoute({ route }: NativeStackScreenProps<RootStackParamList, 'Device'>) {
  return <DeviceScreen userCode={route.params?.user_code} />
}

function OauthConsentRoute({ route }: NativeStackScreenProps<RootStackParamList, 'OauthConsent'>) {
  return <OauthConsentScreen clientId={route.params?.client_id} scope={route.params?.scope} />
}

function AppRoute({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'App'>) {
  const { resetSubmissionGate } = useSubmissionGate()
  return (
    <ShellStateProvider
      startInInterview={route.params?.start === 'interview'}
      onRegister={() => navigation.replace('Registration')}
      onLogin={() => navigation.replace('Login')}
      onOpenPrintout={(year) => navigation.navigate('Printout', { year: String(year) })}
      onOpenConfirmation={(year) => navigation.navigate('Confirmation', { year: String(year) })}
      onSignedOut={() => {
        resetSubmissionGate()
        queryClient.clear()
        navigation.replace('Login')
        rememberReturnTo(null)
      }}
    >
      <TabbedShell />
    </ShellStateProvider>
  )
}

function TabbedShell() {
  const { state: sessionState } = useAccountSession()
  const linkTo = useLinkTo()
  const { taxYear, pendingPath, setPendingPath, setFunnelPath, focusedTab, switchToTab, openCockpitScreen } = useShellState()

  useEffect(() => {
    if (pendingPath === null) return
    const view = viewAfterInterview(pendingPath, sessionState.status)
    if (view === null) return
    setPendingPath(null)
    // A guest goes to the Konto-Wand and leaves for registration — remember where they were heading.
    rememberPendingPath(view === 'konto-wand' ? pendingPath : null)
    switch (view) {
      case 'konto-wand':
        openCockpitScreen('AccountWall')
        break
      case 'rente':
        openCockpitScreen('Pension', { year: taxYear })
        break
      case 'ch':
        openCockpitScreen('CrossBorder', { year: taxYear })
        break
      case 'lstb':
        openCockpitScreen('Lstb', { year: taxYear })
        break
    }
  }, [pendingPath, sessionState.status, setPendingPath, openCockpitScreen, taxYear])

  // Back from registration / login / onboarding with an account: prefer a deep-link return URL over the pending path.
  useEffect(() => {
    if (sessionState.status !== 'signed-in') return
    const returnTo = rememberedReturnTo()
    if (returnTo !== null) {
      rememberReturnTo(null)
      rememberPendingPath(null)
      linkTo(returnTo)
      return
    }
    const remembered = rememberedPendingPath()
    if (remembered === null) return
    rememberPendingPath(null)
    setFunnelPath(remembered)
    setPendingPath(remembered)
  }, [sessionState.status, linkTo, setFunnelPath, setPendingPath])

  return (
    <CopilotBridgeProvider
      mode={focusedTab === 'Owl' ? 'eulen-modus' : 'cockpit'}
      onModeChange={(next) => switchToTab(next === 'eulen-modus' ? 'Owl' : 'Cockpit')}
      taxYear={taxYear}
      isAuthenticated={sessionState.status === 'signed-in'}
    >
      <AppTabs />
    </CopilotBridgeProvider>
  )
}
