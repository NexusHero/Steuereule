import { useEffect, useRef, useState, type ReactNode } from 'react'
import * as RN from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { I18nextProvider, useTranslation } from 'react-i18next'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DarkTheme, DefaultTheme, NavigationContainer, createNavigationContainerRef, useLinkTo } from '@react-navigation/native'
import { createNativeStackNavigator, type NativeStackScreenProps } from '@react-navigation/native-stack'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ThemeProvider, useBreakpoint, useTheme } from '@steuereule/ui'
import { configureApiClient } from '@steuereule/api-client'
import { createAppI18n } from './src/i18n/app-i18n'
import { APP_NS } from './src/i18n/resources'
import { createAppAuthClient } from './src/auth/auth-client'
import { AuthClientProvider } from './src/auth/AuthClientProvider'
import { APP_QUERY_DEFAULTS } from './src/query-client'
import { SplashScreen } from './src/screens/SplashScreen'
import { LoginScreen } from './src/screens/LoginScreen'
import { RegistrationScreen } from './src/screens/RegistrationScreen'
import { carryAssistantSignIn } from './src/auth/assistant-sign-in'
import { OnboardingScreen } from './src/screens/OnboardingScreen'
import { LstbScreen } from './src/screens/lstb/LstbScreen'
import { CatalogScreen } from './src/screens/catalog/CatalogScreen'
import { CapitalScreen } from './src/screens/capital/CapitalScreen'
import { RentalScreen } from './src/screens/rental/RentalScreen'
import { CrossBorderScreen } from './src/screens/cross-border/CrossBorderScreen'
import { PensionerScreen } from './src/screens/pension/PensionerScreen'
import { WorkdaysScreen } from './src/screens/workdays/WorkdaysScreen'
import { DeviceScreen } from './src/screens/device/DeviceScreen'
import { LegalScreen } from './src/screens/legal/LegalScreen'
import { MasterDataScreen } from './src/screens/master-data/MasterDataScreen'
import { PrintoutScreen } from './src/screens/printout/PrintoutScreen'
import { usePlausibility } from './src/screens/plausibility/usePlausibility'
import { LoadingState } from './src/screens/shared/ScreenState'
import { ConfirmationScreen, type ConfirmationForm } from './src/screens/confirmation/ConfirmationScreen'
import { PasswordResetScreen } from './src/screens/PasswordResetScreen'
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
import { formatDocumentTitle, linking } from './src/navigation/linking'
import { ShellStateProvider, useShellState } from './src/navigation/ShellState'
import { SubmissionGateProvider, useSubmissionGate } from './src/navigation/SubmissionGateContext'
import { AppTabs } from './src/navigation/AppTabs'
import { AppearanceProvider, resolveThemeMode, useAppearance } from './src/lib/appearance'
import { syncHapticsPreferenceFromStorage } from './src/lib/hapticsPreference'
import { onSessionExpired, resetSessionExpiry, watchForSessionExpiry } from './src/net/sessionExpiry'

const i18n = createAppI18n('de')
const queryClient = new QueryClient({ defaultOptions: APP_QUERY_DEFAULTS })
followNativeAppFocus()
syncHapticsPreferenceFromStorage()

const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000'
configureApiClient({ baseUrl: apiBaseUrl, onApiError: watchForSessionExpiry })

const authClient = createAppAuthClient(apiBaseUrl)

const RootStack = createNativeStackNavigator<RootStackParamList>()
const rootNavigation = createNavigationContainerRef<RootStackParamList>()

/** WEB-24: an expired session opens the sign-in and remembers the place to come back to. */
function useSessionExpiryRedirect(): void {
  useEffect(
    () =>
      onSessionExpired(() => {
        if (RN.Platform.OS === 'web' && typeof window !== 'undefined') {
          rememberReturnTo(`${window.location.pathname}${window.location.search}`)
        }
        if (rootNavigation.isReady()) rootNavigation.reset({ index: 0, routes: [{ name: 'Login', params: { expired: true } }] })
      }),
    [],
  )
}

export default function App() {
  useEffect(() => {
    syncHapticsPreferenceFromStorage()
  }, [])

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <AppearanceProvider>
            <ThemeBridge>
              <AuthClientProvider client={authClient} apiBaseUrl={apiBaseUrl}>
                <SubmissionGateProvider>
                  <ThemedShellFrame>
                    <RootNavigator />
                  </ThemedShellFrame>
                </SubmissionGateProvider>
              </AuthClientProvider>
            </ThemeBridge>
          </AppearanceProvider>
        </I18nextProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  )
}

function ThemeBridge({ children }: { readonly children: ReactNode }) {
  const colorScheme = RN.useColorScheme()
  const { preference } = useAppearance()
  const mode = resolveThemeMode(preference, colorScheme)
  return <ThemeProvider mode={mode}>{children}</ThemeProvider>
}

function ThemedShellFrame({ children }: { readonly children: ReactNode }) {
  const t = useTheme()

  useEffect(() => {
    if (RN.Platform.OS !== 'web' || typeof document === 'undefined') return
    document.body.style.backgroundColor = t.color.grund
    document.documentElement.style.colorScheme = t.mode
    const svgFavicon = `data:image/svg+xml,${encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="22" fill="#0d0f08"/><path d="M20 36 L30 10 L41 24 Z" fill="#c9f229"/><path d="M76 36 L66 10 L55 24 Z" fill="#c9f229"/><rect x="14" y="20" width="68" height="64" rx="30" fill="#c9f229"/><path d="M48 58 L55 65 L48 74 L41 65 Z" fill="#0d0f08"/><rect x="42" y="44" width="12" height="6" rx="3" fill="#0d0f08"/><circle cx="33" cy="47" r="14" fill="#0d0f08"/><circle cx="63" cy="47" r="14" fill="#0d0f08"/><circle cx="36" cy="45" r="5.5" fill="#c9f229"/><circle cx="66" cy="45" r="5.5" fill="#c9f229"/></svg>',
    )}`
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.type = 'image/svg+xml'
    link.href = svgFavicon
  }, [t.color.grund, t.mode])

  // "Funke ruhig": long German compounds in large titles ("Lohnsteuerbescheinigung") break at a
  // syllable with a hyphen instead of mid-word. Needs the document language for the browser's
  // hyphenation dictionary.
  const language = useTranslation(APP_NS).i18n.language
  useEffect(() => {
    if (RN.Platform.OS !== 'web' || typeof document === 'undefined') return
    // Follows a language switch, so English text is hyphenated with the English dictionary.
    document.documentElement.lang = language
    document.body.style.setProperty('hyphens', 'auto')
    document.body.style.setProperty('-webkit-hyphens', 'auto')
    // Compound words (10+ letters, 4 on each side) such as "Familien-stand" and "Steuer-nummer"
    // hyphenate cleanly at syllable boundaries on 375 px mobile instead of breaking mid-letter.
    document.body.style.setProperty('hyphenate-limit-chars', '10 4 4')
  }, [language])

  return (
    <RN.View style={{ flex: 1, backgroundColor: t.color.grund }}>
      {children}
      <StatusBar style={t.mode === 'dark' ? 'light' : 'dark'} />
    </RN.View>
  )
}

function RootNavigator() {
  useSessionExpiryRedirect()
  const t = useTheme()
  const baseNavTheme = t.mode === 'dark' ? DarkTheme : DefaultTheme
  const navTheme = {
    ...baseNavTheme,
    dark: t.mode === 'dark',
    colors: {
      ...baseNavTheme.colors,
      primary: t.color.funke,
      background: t.color.grund,
      card: t.color.karte,
      text: t.color.tinte,
      border: t.color.linie,
      notification: t.color.fehler,
    },
  }

  return (
    <NavigationContainer
      ref={rootNavigation}
      linking={linking}
      theme={navTheme}
      documentTitle={{
        formatter: (_options, route) => formatDocumentTitle(route?.name),
      }}
    >
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
        <RootStack.Screen name="PasswordReset" component={PasswordResetRoute} />
        <RootStack.Screen name="OauthConsent" component={OauthConsentRoute} />
      </RootStack.Navigator>
    </NavigationContainer>
  )
}

function SplashRoute({ navigation }: NativeStackScreenProps<RootStackParamList, 'Splash'>) {
  return <SplashScreen onAdvance={() => navigation.replace('Login')} />
}

function LoginRoute({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'Login'>) {
  return (
    <LoginScreen
      startWithForgot={Boolean(route.params?.forgot)}
      sessionExpired={Boolean(route.params?.expired)}
      onDone={() => {
        resetSessionExpiry()
        navigation.replace('App')
      }}
      onGuest={() => navigation.replace('App', { start: 'interview' })}
      onRegister={() => carryAssistantSignIn('/registrierung') || navigation.replace('Registration')}
      onLegal={(page) => navigation.navigate('Legal', { page })}
    />
  )
}

function RegistrationRoute({ navigation }: NativeStackScreenProps<RootStackParamList, 'Registration'>) {
  return (
    <RegistrationScreen
      onDone={() => navigation.replace('Onboarding')}
      onLogin={() => carryAssistantSignIn('/login') || navigation.replace('Login')}
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
  const [view, setView] = useState<'ausdruck' | 'stammdaten' | 'sonderausgaben' | 'kinder' | 'vermietung' | 'kapital' | 'grenzgaenger' | 'lstb' | 'arbeitsweg' | 'rente'>('ausdruck')
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
  if (view === 'lstb') return <LstbScreen taxYear={year} onDone={() => setView('ausdruck')} onBack={() => setView('ausdruck')} />
  if (view === 'arbeitsweg') return <WorkdaysScreen taxYear={year} onDone={() => setView('ausdruck')} onBack={() => setView('ausdruck')} />
  if (view === 'rente') return <PensionerScreen taxYear={year} onDone={() => setView('ausdruck')} onBack={() => setView('ausdruck')} />
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
      onInspectField={(screen) => {
        if (screen === 'lstb') setView('lstb')
        else if (screen === 'commute') setView('arbeitsweg')
        else if (screen === 'rente') setView('rente')
        else if (screen === 'chLohnausweis') setView('grenzgaenger')
        else if (screen === 'kapital') setView('kapital')
        else if (screen === 'vermietung') setView('vermietung')
        else if (screen === 'kind') setView('kinder')
        else if (screen === 'interview') setView('sonderausgaben')
        else setView('stammdaten')
      }}
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

function PasswordResetRoute({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'PasswordReset'>) {
  // The token is read once into state and taken out of the address, so it neither stays in the
  // browser history nor gets copied along with the URL.
  const [token] = useState(() => route.params?.token)
  useEffect(() => {
    if (route.params?.token !== undefined || route.params?.error !== undefined) {
      navigation.setParams({ token: undefined, error: undefined })
    }
  }, [navigation, route.params?.token, route.params?.error])
  return (
    <PasswordResetScreen
      token={token}
      onDone={() => navigation.replace('Login')}
      onRequestNew={() => navigation.replace('Login', { forgot: true })}
    />
  )
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
  const { taxYear, setTaxYear, pendingPath, setPendingPath, setFunnelPath, focusedTab, switchToTab, openCockpitScreen, onSignedOut } = useShellState()

  // Signed out elsewhere (another device revoked this session, or it expired) while the app is open:
  // leave for the sign-in instead of carrying on as a guest (#450 Teil 5A).
  const previousStatus = useRef(sessionState.status)
  useEffect(() => {
    const before = previousStatus.current
    previousStatus.current = sessionState.status
    if (before === 'signed-in' && sessionState.status === 'signed-out') onSignedOut()
  }, [sessionState.status, onSignedOut])

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
      onSwitchYear={setTaxYear}
      isAuthenticated={sessionState.status === 'signed-in'}
    >
      <AppTabs />
    </CopilotBridgeProvider>
  )
}
