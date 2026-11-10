import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { I18nextProvider, useTranslation } from 'react-i18next'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NavigationContainer, type LinkingOptions } from '@react-navigation/native'
import { createNativeStackNavigator, type NativeStackScreenProps } from '@react-navigation/native-stack'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import { OwlGlyph, TabBar, TAB_ICON_PATHS, tabBarClearance, ThemeProvider, useTheme, type TabItem } from '@steuereule/ui'
import { configureApiClient } from '@steuereule/api-client'
import { createAppI18n } from './src/i18n/app-i18n'
import { APP_NS } from './src/i18n/resources'
import { createAppAuthClient } from './src/auth/auth-client'
import { AuthClientProvider } from './src/auth/AuthClientProvider'
import { APP_QUERY_DEFAULTS } from './src/query-client'
import { TabIcon } from './src/icons/TabIcon'
import { SplashScreen } from './src/screens/SplashScreen'
import { LoginScreen } from './src/screens/LoginScreen'
import { RegistrationScreen } from './src/screens/RegistrationScreen'
import { OnboardingScreen } from './src/screens/OnboardingScreen'
import { CockpitScreen } from './src/screens/cockpit/CockpitScreen'
import { InterviewScreen } from './src/screens/interview/InterviewScreen'
import { LstbScreen } from './src/screens/lstb/LstbScreen'
import { CatalogScreen } from './src/screens/catalog/CatalogScreen'
import { WorkdaysScreen } from './src/screens/workdays/WorkdaysScreen'
import { PlausibilityScreen } from './src/screens/plausibility/PlausibilityScreen'
import { FilingTypeComparisonScreen } from './src/screens/filing-type-comparison/FilingTypeComparisonScreen'
import { ReceiptsScreen } from './src/screens/receipts/ReceiptsScreen'
import { AssessmentScreen } from './src/screens/assessment/AssessmentScreen'
import { CapitalScreen } from './src/screens/capital/CapitalScreen'
import { RentalScreen } from './src/screens/rental/RentalScreen'
import { CrossBorderScreen } from './src/screens/cross-border/CrossBorderScreen'
import { PensionerScreen } from './src/screens/pension/PensionerScreen'
import { ProfileScreen } from './src/screens/ProfileScreen'
import { PrivacyScreen } from './src/screens/PrivacyScreen'
import { SecurityScreen } from './src/screens/security/SecurityScreen'
import { DeviceScreen } from './src/screens/device/DeviceScreen'
import { LegalScreen } from './src/screens/legal/LegalScreen'
import { MasterDataScreen } from './src/screens/master-data/MasterDataScreen'
import { PrintoutScreen } from './src/screens/printout/PrintoutScreen'
import { ConfirmationScreen, type ConfirmationForm } from './src/screens/confirmation/ConfirmationScreen'
import { OauthConsentScreen } from './src/screens/oauth/OauthConsentScreen'
import { ChildrenScreen } from './src/screens/children/ChildrenScreen'
import { rememberPendingPath, rememberTaxYear, rememberedPendingPath, rememberedTaxYear } from './src/screens/funnel/sessionMemory'
import { OwlModeScreen } from './src/screens/advisor/OwlModeScreen'
import { CopilotBridgeProvider } from './src/screens/advisor/CopilotBridgeProvider'
import { operatorFromEnv, LEGAL_PAGES, type LegalPage } from './src/screens/legal/texts'
import { AccountWallScreen, pathFromAnswers, type FunnelPath } from './src/screens/funnel/KontoWandScreen'
import { useAccountSession } from './src/auth/useAccountSession'
import { followNativeAppFocus } from './src/app-focus'
import { SELECTABLE_TAX_YEARS, CURRENT_TAX_YEAR } from './src/config/taxYear'
import { viewAfterInterview } from './src/screens/funnel/afterTheInterview'

const i18n = createAppI18n('de')
const queryClient = new QueryClient({ defaultOptions: APP_QUERY_DEFAULTS })
followNativeAppFocus()

const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000'
configureApiClient({ baseUrl: apiBaseUrl })

const authClient = createAppAuthClient(apiBaseUrl)

type RootStackParamList = {
  Splash: undefined
  Login: undefined
  Registration: undefined
  Onboarding: undefined
  App: { start?: 'interview' } | undefined
  Device: { user_code?: string } | undefined
  Legal: { page: LegalPage }
  // `zahlung` is the query parameter in the Stripe return URL; it stays as the API writes it.
  Printout: { year: string; payment?: string }
  Confirmation: { year: string }
  OauthConsent: { client_id?: string; scope?: string } | undefined
}

const RootStack = createNativeStackNavigator<RootStackParamList>()

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [],
  config: {
    screens: {
      Splash: '',
      Login: 'login',
      Registration: 'registrierung',
      Onboarding: 'onboarding',
      App: 'app',
      Device: 'device',
      Legal: 'rechtliches/:page',
      Printout: 'app/steuerjahr/:year/ausdruck',
      Confirmation: 'app/steuerjahr/:year/bestaetigung',
      OauthConsent: 'oauth/consent',
    },
  },
}

// The advisor owl is a tab of its own, second only to the Cockpit — advice up front.
type Tab = 'cockpit' | 'eule' | 'belege' | 'profil'

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <ThemeProvider mode="light">
            <AuthClientProvider client={authClient}>
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
  const year = Number(route.params?.year)
  useEffect(() => {
    if (!Number.isInteger(year)) navigation.replace('App')
  }, [year, navigation])
  if (!Number.isInteger(year)) return null
  if (view === 'stammdaten') return <MasterDataScreen onBack={() => setView('ausdruck')} />
  if (view === 'grenzgaenger') return <CrossBorderScreen taxYear={year} onDone={() => setView('ausdruck')} />
  if (view === 'kapital') {
    return <CapitalScreen taxYear={year} onDone={() => setView('ausdruck')} onBack={() => setView('ausdruck')} />
  }
  if (view === 'vermietung') {
    return <RentalScreen taxYear={year} onDone={() => setView('ausdruck')} onBack={() => setView('ausdruck')} />
  }
  if (view === 'kinder') {
    return <ChildrenScreen taxYear={year} onDone={() => setView('ausdruck')} onBack={() => setView('ausdruck')} />
  }
  if (view === 'sonderausgaben') {
    return (
      <CatalogScreen
        entry="sonderausgaben"
        taxYear={year}
        revisit
        onDone={() => setView('ausdruck')}
        onBack={() => setView('ausdruck')}
      />
    )
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
  const [tab, setTab] = useState<Tab>('cockpit')

  return (
    <TabbedShell
      tab={tab}
      onTabChange={setTab}
      startInInterview={route.params?.start === 'interview'}
      onRegister={() => navigation.replace('Registration')}
      onLogin={() => navigation.replace('Login')}
      onOpenPrintout={(year) => navigation.navigate('Printout', { year: String(year) })}
      onOpenConfirmation={(year) => navigation.navigate('Confirmation', { year: String(year) })}
      onSignedOut={() => {
        queryClient.clear()
        setTab('cockpit')
        navigation.replace('Login')
      }}
    />
  )
}

/** The tabbed part of the app: a screen plus the design system's floating tab bar. */
interface TabbedShellProps {
  readonly tab: Tab
  readonly onTabChange: (tab: Tab) => void
  readonly onSignedOut: () => void
  readonly startInInterview?: boolean
  readonly onRegister?: () => void
  readonly onLogin?: () => void
  readonly onOpenPrintout?: (year: number) => void
  readonly onOpenConfirmation?: (year: number) => void
}

function TabbedShell({ tab, onTabChange, onSignedOut, startInInterview = false, onRegister = () => {}, onLogin = () => {}, onOpenPrintout, onOpenConfirmation }: TabbedShellProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const { state: sessionState } = useAccountSession()
  const insets = useSafeAreaInsets()
  const [funnelPath, setFunnelPath] = useState<FunnelPath>('angestellte')

  const [profileView, setProfileView] = useState<'main' | 'datenschutz' | 'sicherheit' | 'stammdaten'>('main')
  const [cockpitView, setCockpitView] = useState<
    | 'main'
    | 'interview'
    | 'lstb'
    | 'rente'
    | 'katalog-lebenslagen'
    | 'katalog-einkuenfte'
    | 'katalog-sonderausgaben'
    | 'arbeitstage'
    | 'plausibilitaet'
    | 'veranlagungsartenvergleich'
    | 'ch'
    | 'bescheid'
    | 'konto-wand'
    | 'kapital'
    | 'vermietung'
    | 'kinder'
    | 'stammdaten'
    | 'partner'
  >(startInInterview ? 'interview' : 'main')
  const [pendingPath, setPendingPath] = useState<FunnelPath | null>(null)
  const [taxYear, setTaxYearState] = useState(() => rememberedTaxYear(CURRENT_TAX_YEAR, SELECTABLE_TAX_YEARS))
  const setTaxYear = (year: number) => {
    rememberTaxYear(year)
    setTaxYearState(year)
  }
  // ADR-0054: Person A records a partner's figures (no own account) in the regular masks.
  const [partnerScreen, setPartnerScreen] = useState<{ readonly area: 'lstb' | 'arbeitsweg'; readonly name: string } | null>(null)
  const [catalogRevisit, setCatalogRevisit] = useState(false)

  useEffect(() => {
    if (pendingPath === null) return
    const view = viewAfterInterview(pendingPath, sessionState.status)
    if (view === null) return
    setPendingPath(null)
    // A guest goes to the Konto-Wand and leaves for registration — remember where they were heading.
    rememberPendingPath(view === 'konto-wand' ? pendingPath : null)
    setCockpitView(view)
  }, [pendingPath, sessionState.status])

  // Back from registration / onboarding with an account: carry on with the path the guest started.
  useEffect(() => {
    if (sessionState.status !== 'signed-in') return
    const remembered = rememberedPendingPath()
    if (remembered === null) return
    rememberPendingPath(null)
    setFunnelPath(remembered)
    setPendingPath(remembered)
  }, [sessionState.status])

  const iconColor = (id: Tab) => (id === tab ? t.color.tinte : t.color.tinte2)

  const tabs: TabItem[] = [
    {
      id: 'cockpit',
      label: tr('tabs.cockpit'),
      icon: <TabIcon path={TAB_ICON_PATHS.cockpit} color={iconColor('cockpit')} />,
    },
    {
      id: 'eule',
      label: tr('tabs.eule'),
      icon: <OwlGlyph size={22} ink={iconColor('eule')} ground={tab === 'eule' ? t.color.funke : t.color.karte} testID="tab-icon-eule" />,
    },
    {
      id: 'belege',
      label: tr('tabs.belege'),
      icon: <TabIcon path={TAB_ICON_PATHS.belege} color={iconColor('belege')} />,
    },
    {
      id: 'profil',
      label: tr('tabs.profil'),
      icon: <TabIcon path={TAB_ICON_PATHS.profil} color={iconColor('profil')} />,
    },
  ]

  function changeTab(next: Tab) {
    setProfileView('main')
    setCockpitView('main')
    onTabChange(next)
  }

  const showsTabBar = profileView === 'main'

  return (
    <CopilotBridgeProvider
      mode={tab === 'eule' ? 'eulen-modus' : 'cockpit'}
      onModeChange={(next) => changeTab(next === 'eulen-modus' ? 'eule' : 'cockpit')}
      taxYear={taxYear}
      isAuthenticated={sessionState.status === 'signed-in'}
    >
      <View style={{ flex: 1 }}>
      <View style={{ flex: 1, backgroundColor: t.color.grund, paddingBottom: showsTabBar ? tabBarClearance(t, insets.bottom) : 0 }}>
        {tab === 'cockpit' && cockpitView === 'main' ? <CockpitScreen
            taxYear={taxYear}
            onYearChange={setTaxYear}
            onOpenInterview={() => setCockpitView('interview')}
            onOpenAssessment={() => setCockpitView('bescheid')}
            onOpenCapital={() => setCockpitView('kapital')}
            onOpenRental={() => setCockpitView('vermietung')}
            onOpenKinder={() => setCockpitView('kinder')}
            onOpenOwlMode={() => changeTab('eule')}
            onOpenMasterData={() => setCockpitView('stammdaten')}
            onContinuePath={(path) => {
              setFunnelPath(path)
              setPendingPath(path)
            }}
            {...(onOpenPrintout ? { onOpenPrintout } : {})}
            {...(onOpenConfirmation ? { onOpenConfirmation } : {})}
          /> : null}
        {tab === 'cockpit' && cockpitView === 'interview' ? (
          <InterviewScreen taxYear={taxYear}
            onDone={(answers) => {
              const path = pathFromAnswers(answers)
              setFunnelPath(path)
              setPendingPath(path)
            }}
          />
        ) : null}
        {tab === 'cockpit' && cockpitView === 'stammdaten' ? <MasterDataScreen
            taxYear={taxYear}
            onBack={() => setCockpitView('main')}
            onRecordPartner={(area, name) => {
              setPartnerScreen({ area, name })
              setCockpitView('partner')
            }}
          /> : null}
        {tab === 'cockpit' && cockpitView === 'partner' && partnerScreen?.area === 'lstb' ? (
          <LstbScreen
            taxYear={taxYear}
            partnerName={partnerScreen.name}
            onSwitchTaxYear={setTaxYear}
            onDone={() => setCockpitView('stammdaten')}
            onBack={() => setCockpitView('stammdaten')}
          />
        ) : null}
        {tab === 'cockpit' && cockpitView === 'partner' && partnerScreen?.area === 'arbeitsweg' ? (
          <WorkdaysScreen taxYear={taxYear} partnerName={partnerScreen.name} onDone={() => setCockpitView('stammdaten')} onBack={() => setCockpitView('stammdaten')} />
        ) : null}
        {tab === 'cockpit' && cockpitView === 'konto-wand' ? (
          <AccountWallScreen path={funnelPath} onRegister={onRegister} onLogin={onLogin} onLater={() => setCockpitView('main')} />
        ) : null}
        {tab === 'cockpit' && cockpitView === 'rente' ? (
          <PensionerScreen taxYear={taxYear} onDone={() => setCockpitView('main')} onBack={() => setCockpitView('main')} />
        ) : null}
        {tab === 'cockpit' && cockpitView === 'ch' ? (
          <CrossBorderScreen
            taxYear={taxYear}
            onDone={() => {
              setCatalogRevisit(false)
              setCockpitView('katalog-einkuenfte')
            }}
          />
        ) : null}
        {tab === 'cockpit' && cockpitView === 'lstb' ? (
          <LstbScreen
            taxYear={taxYear}
            onSwitchTaxYear={setTaxYear}
            onDone={() => {
              setCatalogRevisit(false)
              setCockpitView('katalog-lebenslagen')
            }}
            onBack={() => setCockpitView('main')}
          />
        ) : null}
        {tab === 'cockpit' && cockpitView === 'katalog-lebenslagen' ? (
          <CatalogScreen
            taxYear={taxYear}
            entry="lebenslagen"
            revisit={catalogRevisit}
            onDone={() => {
              setCatalogRevisit(false)
              setCockpitView('katalog-einkuenfte')
            }}
            onBack={() => setCockpitView('lstb')}
          />
        ) : null}
        {tab === 'cockpit' && cockpitView === 'katalog-einkuenfte' ? (
          <CatalogScreen
            taxYear={taxYear}
            entry="einkuenfte"
            revisit={catalogRevisit}
            onDone={() => {
              setCatalogRevisit(false)
              setCockpitView('katalog-sonderausgaben')
            }}
            onBack={() => {
              setCatalogRevisit(true)
              setCockpitView(funnelPath === 'ch' ? 'ch' : 'katalog-lebenslagen')
            }}
          />
        ) : null}
        {tab === 'cockpit' && cockpitView === 'katalog-sonderausgaben' ? (
          <CatalogScreen
            taxYear={taxYear}
            entry="sonderausgaben"
            revisit={catalogRevisit}
            onDone={() => {
              setCatalogRevisit(false)
              setCockpitView('arbeitstage')
            }}
            onBack={() => {
              setCatalogRevisit(true)
              setCockpitView('katalog-einkuenfte')
            }}
          />
        ) : null}
        {tab === 'cockpit' && cockpitView === 'arbeitstage' ? (
          <WorkdaysScreen
            taxYear={taxYear}
            onDone={() => setCockpitView(funnelPath === 'ch' ? 'main' : 'plausibilitaet')}
            onBack={() => {
              setCatalogRevisit(true)
              setCockpitView('katalog-sonderausgaben')
            }}
          />
        ) : null}
        {tab === 'cockpit' && cockpitView === 'plausibilitaet' ? (
          <PlausibilityScreen taxYear={taxYear} onBack={() => setCockpitView('main')} onDone={() => setCockpitView('veranlagungsartenvergleich')} />
        ) : null}
        {tab === 'cockpit' && cockpitView === 'veranlagungsartenvergleich' ? (
          <FilingTypeComparisonScreen taxYear={taxYear} onBack={() => setCockpitView('plausibilitaet')} onDone={() => setCockpitView('main')} />
        ) : null}
        {tab === 'cockpit' && cockpitView === 'bescheid' ? (
          <AssessmentScreen taxYear={taxYear} onDone={() => setCockpitView('main')} onBack={() => setCockpitView('main')} />
        ) : null}
        {tab === 'cockpit' && cockpitView === 'kapital' ? (
          <CapitalScreen taxYear={taxYear} onDone={() => setCockpitView('main')} onBack={() => setCockpitView('main')} />
        ) : null}
        {tab === 'cockpit' && cockpitView === 'vermietung' ? (
          <RentalScreen taxYear={taxYear} onDone={() => setCockpitView('main')} onBack={() => setCockpitView('main')} />
        ) : null}
        {tab === 'cockpit' && cockpitView === 'kinder' ? (
          <ChildrenScreen taxYear={taxYear} onDone={() => setCockpitView('main')} onBack={() => setCockpitView('main')} />
        ) : null}
        {tab === 'eule' ? (
          <OwlModeScreen
            taxYear={taxYear}
            isGuest={sessionState.status !== 'signed-in'}
            onRegister={onRegister}
            onLogin={onLogin}
            onDone={() => changeTab('cockpit')}
          />
        ) : null}
        {tab === 'belege' ? <ReceiptsScreen /> : null}
        {tab === 'profil' && profileView === 'main' ? (
          <ProfileScreen
            onOpenPrivacy={() => setProfileView('datenschutz')}
            onOpenSecurity={() => setProfileView('sicherheit')}
            onOpenMasterData={() => setProfileView('stammdaten')}
            onSignedOut={onSignedOut}
          />
        ) : null}
        {tab === 'profil' && profileView === 'datenschutz' ? (
          <PrivacyScreen onBack={() => setProfileView('main')} onAccountDeleted={onSignedOut} />
        ) : null}
        {tab === 'profil' && profileView === 'stammdaten' ? <MasterDataScreen onBack={() => setProfileView('main')} /> : null}
        {tab === 'profil' && profileView === 'sicherheit' ? (
          <SecurityScreen onBack={() => setProfileView('main')} />
        ) : null}
      </View>
      {showsTabBar ? <TabBar tabs={tabs} active={tab} onChange={(id) => changeTab(id as Tab)} bottomInset={insets.bottom} /> : null}
    </View>
    </CopilotBridgeProvider>
  )
}
