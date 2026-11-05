import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { I18nextProvider, useTranslation } from 'react-i18next'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NavigationContainer, type LinkingOptions } from '@react-navigation/native'
import { createNativeStackNavigator, type NativeStackScreenProps } from '@react-navigation/native-stack'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import { TabBar, TAB_ICON_PATHS, tabBarClearance, ThemeProvider, useTheme, type TabItem } from '@steuereule/ui'
import { configureApiClient } from '@steuereule/api-client'
import { createAppI18n } from './src/i18n/app-i18n'
import { APP_NS } from './src/i18n/resources'
import { createAppAuthClient } from './src/auth/auth-client'
import { AuthClientProvider } from './src/auth/AuthClientProvider'
import { APP_QUERY_DEFAULTS } from './src/query-client'
import { TabIcon } from './src/icons/TabIcon'
import { SplashScreen } from './src/screens/SplashScreen'
import { LoginScreen } from './src/screens/LoginScreen'
import { RegistrierungScreen } from './src/screens/RegistrierungScreen'
import { OnboardingScreen } from './src/screens/OnboardingScreen'
import { CockpitScreen } from './src/screens/cockpit/CockpitScreen'
import { InterviewScreen } from './src/screens/interview/InterviewScreen'
import { LstbScreen } from './src/screens/lstb/LstbScreen'
import { KatalogScreen } from './src/screens/katalog/KatalogScreen'
import { ArbeitstageScreen } from './src/screens/arbeitstage/ArbeitstageScreen'
import { PlausibilitaetScreen } from './src/screens/plausibilitaet/PlausibilitaetScreen'
import { VeranlagungsartenvergleichScreen } from './src/screens/veranlagungsartenvergleich/VeranlagungsartenvergleichScreen'
import { BelegeScreen } from './src/screens/belege/BelegeScreen'
import { BescheidScreen } from './src/screens/bescheid/BescheidScreen'
import { KapitalScreen } from './src/screens/kapital/KapitalScreen'
import { VermietungScreen } from './src/screens/vermietung/VermietungScreen'
import { GrenzgaengerScreen } from './src/screens/grenzgaenger/GrenzgaengerScreen'
import { RentnerScreen } from './src/screens/rente/RentnerScreen'
import { ProfilScreen } from './src/screens/ProfilScreen'
import { DatenschutzScreen } from './src/screens/DatenschutzScreen'
import { SicherheitScreen } from './src/screens/security/SicherheitScreen'
import { DeviceScreen } from './src/screens/device/DeviceScreen'
import { RechtlichesScreen } from './src/screens/rechtliches/RechtlichesScreen'
import { StammdatenScreen } from './src/screens/stammdaten/StammdatenScreen'
import { AusdruckScreen } from './src/screens/ausdruck/AusdruckScreen'
import { BestaetigungScreen, type BestaetigungsMaske } from './src/screens/bestaetigung/BestaetigungScreen'
import { OauthConsentScreen } from './src/screens/oauth/OauthConsentScreen'
import { KinderScreen } from './src/screens/kinder/KinderScreen'
import { EulenModusScreen } from './src/screens/berater/EulenModusScreen'
import { betreiberAusUmgebung, RECHTLICHE_SEITEN, type RechtlicheSeite } from './src/screens/rechtliches/texte'
import { KontoWandScreen, pfadAusAntworten, type FunnelPfad } from './src/screens/funnel/KontoWandScreen'
import { useAccountSession } from './src/auth/useAccountSession'
import { followNativeAppFocus } from './src/app-focus'
import { ansichtNachDemInterview } from './src/screens/funnel/nachDemInterview'

const i18n = createAppI18n('de')
const queryClient = new QueryClient({ defaultOptions: APP_QUERY_DEFAULTS })
followNativeAppFocus()

const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000'
configureApiClient({ baseUrl: apiBaseUrl })

const authClient = createAppAuthClient(apiBaseUrl)

type RootStackParamList = {
  Splash: undefined
  Login: undefined
  Registrierung: undefined
  Onboarding: undefined
  App: { start?: 'interview' } | undefined
  Device: { user_code?: string } | undefined
  Rechtliches: { seite: RechtlicheSeite }
  Ausdruck: { jahr: string; zahlung?: string }
  Bestaetigung: { jahr: string }
  OauthConsent: { client_id?: string; scope?: string } | undefined
}

const RootStack = createNativeStackNavigator<RootStackParamList>()

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [],
  config: {
    screens: {
      Splash: '',
      Login: 'login',
      Registrierung: 'registrierung',
      Onboarding: 'onboarding',
      App: 'app',
      Device: 'device',
      Rechtliches: 'rechtliches/:seite',
      Ausdruck: 'app/steuerjahr/:jahr/ausdruck',
      Bestaetigung: 'app/steuerjahr/:jahr/bestaetigung',
      OauthConsent: 'oauth/consent',
    },
  },
}

type Tab = 'cockpit' | 'belege' | 'profil'

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
                    <RootStack.Screen name="Registrierung" component={RegistrierungRoute} />
                    <RootStack.Screen name="Onboarding" component={OnboardingRoute} />
                    <RootStack.Screen name="App" component={AppRoute} />
                    <RootStack.Screen name="Device" component={DeviceRoute} />
                    <RootStack.Screen name="Rechtliches" component={RechtlichesRoute} />
                    <RootStack.Screen name="Ausdruck" component={AusdruckRoute} />
                    <RootStack.Screen name="Bestaetigung" component={BestaetigungRoute} />
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
      onRegister={() => navigation.replace('Registrierung')}
      onRechtliches={(seite) => navigation.navigate('Rechtliches', { seite })}
    />
  )
}

function RegistrierungRoute({ navigation }: NativeStackScreenProps<RootStackParamList, 'Registrierung'>) {
  return (
    <RegistrierungScreen
      onDone={() => navigation.replace('Onboarding')}
      onLogin={() => navigation.replace('Login')}
    />
  )
}

function OnboardingRoute({ navigation }: NativeStackScreenProps<RootStackParamList, 'Onboarding'>) {
  return <OnboardingScreen onDone={() => navigation.replace('App')} />
}

const BETREIBER = betreiberAusUmgebung({
  EXPO_PUBLIC_BETREIBER_NAME: process.env.EXPO_PUBLIC_BETREIBER_NAME,
  EXPO_PUBLIC_BETREIBER_ANSCHRIFT: process.env.EXPO_PUBLIC_BETREIBER_ANSCHRIFT,
  EXPO_PUBLIC_BETREIBER_EMAIL: process.env.EXPO_PUBLIC_BETREIBER_EMAIL,
  EXPO_PUBLIC_BETREIBER_VERTRETEN: process.env.EXPO_PUBLIC_BETREIBER_VERTRETEN,
  EXPO_PUBLIC_BETREIBER_USTID: process.env.EXPO_PUBLIC_BETREIBER_USTID,
})

function RechtlichesRoute({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'Rechtliches'>) {
  const seite = RECHTLICHE_SEITEN.includes(route.params?.seite) ? route.params.seite : 'impressum'
  return (
    <RechtlichesScreen
      seite={seite}
      betreiber={BETREIBER}
      onZurueck={() => (navigation.canGoBack() ? navigation.goBack() : navigation.replace('Login'))}
      onSeite={(naechste) => navigation.setParams({ seite: naechste })}
    />
  )
}

function AusdruckRoute({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'Ausdruck'>) {
  const [ansicht, setAnsicht] = useState<'ausdruck' | 'stammdaten' | 'sonderausgaben' | 'kinder' | 'vermietung' | 'kapital' | 'grenzgaenger'>('ausdruck')
  const jahr = Number(route.params?.jahr)
  useEffect(() => {
    if (!Number.isInteger(jahr)) navigation.replace('App')
  }, [jahr, navigation])
  if (!Number.isInteger(jahr)) return null
  if (ansicht === 'stammdaten') return <StammdatenScreen onZurueck={() => setAnsicht('ausdruck')} />
  if (ansicht === 'grenzgaenger') return <GrenzgaengerScreen taxYear={jahr} onDone={() => setAnsicht('ausdruck')} />
  if (ansicht === 'kapital') {
    return <KapitalScreen taxYear={jahr} onDone={() => setAnsicht('ausdruck')} onBack={() => setAnsicht('ausdruck')} />
  }
  if (ansicht === 'vermietung') {
    return <VermietungScreen taxYear={jahr} onDone={() => setAnsicht('ausdruck')} onBack={() => setAnsicht('ausdruck')} />
  }
  if (ansicht === 'kinder') {
    return <KinderScreen taxYear={jahr} onDone={() => setAnsicht('ausdruck')} onBack={() => setAnsicht('ausdruck')} />
  }
  if (ansicht === 'sonderausgaben') {
    return (
      <KatalogScreen
        entry="sonderausgaben"
        taxYear={jahr}
        onDone={() => setAnsicht('ausdruck')}
        onBack={() => setAnsicht('ausdruck')}
      />
    )
  }
  const zahlung = route.params?.zahlung
  return (
    <AusdruckScreen
      jahr={jahr}
      {...(zahlung === 'erfolg' || zahlung === 'abbruch' ? { zahlung } : {})}
      onZurueck={() => (navigation.canGoBack() ? navigation.goBack() : navigation.replace('App'))}
      onAngabenErgaenzen={() => setAnsicht('stammdaten')}
      onRiesterErgaenzen={() => setAnsicht('sonderausgaben')}
      onKinderErgaenzen={() => setAnsicht('kinder')}
      onVermietungErgaenzen={() => setAnsicht('vermietung')}
      onKapitalErgaenzen={() => setAnsicht('kapital')}
      onGrenzgaengerErgaenzen={() => setAnsicht('grenzgaenger')}
      onBestaetigen={() => navigation.navigate('Bestaetigung', { jahr: String(jahr) })}
    />
  )
}

function BestaetigungRoute({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'Bestaetigung'>) {
  const [maske, setMaske] = useState<BestaetigungsMaske | null>(null)
  const jahr = Number(route.params?.jahr)
  useEffect(() => {
    if (!Number.isInteger(jahr)) navigation.replace('App')
  }, [jahr, navigation])
  if (!Number.isInteger(jahr)) return null
  const zurueck = () => setMaske(null)
  if (maske === 'lstb') return <LstbScreen taxYear={jahr} onDone={zurueck} onBack={zurueck} />
  if (maske === 'rente') return <RentnerScreen taxYear={jahr} onDone={zurueck} onBack={zurueck} />
  if (maske === 'kapital') return <KapitalScreen taxYear={jahr} onDone={zurueck} onBack={zurueck} />
  if (maske === 'vermietung') return <VermietungScreen taxYear={jahr} onDone={zurueck} onBack={zurueck} />
  return (
    <BestaetigungScreen
      jahr={jahr}
      onZurueck={() => (navigation.canGoBack() ? navigation.goBack() : navigation.replace('App'))}
      onMaskeOeffnen={setMaske}
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
      onRegister={() => navigation.replace('Registrierung')}
      onLogin={() => navigation.replace('Login')}
      onOpenAusdruck={(jahr) => navigation.navigate('Ausdruck', { jahr: String(jahr) })}
      onOpenBestaetigung={(jahr) => navigation.navigate('Bestaetigung', { jahr: String(jahr) })}
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
  readonly onOpenAusdruck?: (jahr: number) => void
  readonly onOpenBestaetigung?: (jahr: number) => void
}

function TabbedShell({ tab, onTabChange, onSignedOut, startInInterview = false, onRegister = () => {}, onLogin = () => {}, onOpenAusdruck, onOpenBestaetigung }: TabbedShellProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const { state: sessionState } = useAccountSession()
  const insets = useSafeAreaInsets()
  const [funnelPfad, setFunnelPfad] = useState<FunnelPfad>('angestellte')

  const [profilView, setProfilView] = useState<'main' | 'datenschutz' | 'sicherheit' | 'stammdaten'>('main')
  const [cockpitView, setCockpitView] = useState<
    | 'main'
    | 'interview'
    | 'lstb'
    | 'rente'
    | 'katalog-lebenslagen'
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
    | 'eulen-modus'
  >(startInInterview ? 'interview' : 'main')
  const [ausstehenderPfad, setAusstehenderPfad] = useState<FunnelPfad | null>(null)

  useEffect(() => {
    if (ausstehenderPfad === null) return
    const ansicht = ansichtNachDemInterview(ausstehenderPfad, sessionState.status)
    if (ansicht === null) return
    setAusstehenderPfad(null)
    setCockpitView(ansicht)
  }, [ausstehenderPfad, sessionState.status])

  const iconColor = (id: Tab) => (id === tab ? t.color.tinte : t.color.tinte2)

  const tabs: TabItem[] = [
    {
      id: 'cockpit',
      label: tr('tabs.cockpit'),
      icon: <TabIcon path={TAB_ICON_PATHS.cockpit} color={iconColor('cockpit')} />,
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
    setProfilView('main')
    setCockpitView('main')
    onTabChange(next)
  }

  const zeigtTabBar = profilView === 'main'

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, backgroundColor: t.color.grund, paddingBottom: zeigtTabBar ? tabBarClearance(t, insets.bottom) : 0 }}>
        {tab === 'cockpit' && cockpitView === 'main' ? <CockpitScreen
            onOpenInterview={() => setCockpitView('interview')}
            onOpenBescheid={() => setCockpitView('bescheid')}
            onOpenKapital={() => setCockpitView('kapital')}
            onOpenVermietung={() => setCockpitView('vermietung')}
            onOpenKinder={() => setCockpitView('kinder')}
            onOpenEulenModus={() => setCockpitView('eulen-modus')}
            {...(onOpenAusdruck ? { onOpenAusdruck } : {})}
            {...(onOpenBestaetigung ? { onOpenBestaetigung } : {})}
          /> : null}
        {tab === 'cockpit' && cockpitView === 'interview' ? (
          <InterviewScreen
            onDone={(answers) => {
              const pfad = pfadAusAntworten(answers)
              setFunnelPfad(pfad)
              setAusstehenderPfad(pfad)
            }}
          />
        ) : null}
        {tab === 'cockpit' && cockpitView === 'konto-wand' ? (
          <KontoWandScreen pfad={funnelPfad} onRegister={onRegister} onLogin={onLogin} onLater={() => setCockpitView('main')} />
        ) : null}
        {tab === 'cockpit' && cockpitView === 'rente' ? (
          <RentnerScreen onDone={() => setCockpitView('main')} onBack={() => setCockpitView('main')} />
        ) : null}
        {tab === 'cockpit' && cockpitView === 'ch' ? <GrenzgaengerScreen onDone={() => setCockpitView('main')} /> : null}
        {tab === 'cockpit' && cockpitView === 'lstb' ? (
          <LstbScreen onDone={() => setCockpitView('katalog-lebenslagen')} onBack={() => setCockpitView('main')} />
        ) : null}
        {tab === 'cockpit' && cockpitView === 'katalog-lebenslagen' ? (
          <KatalogScreen entry="lebenslagen" onDone={() => setCockpitView('katalog-sonderausgaben')} onBack={() => setCockpitView('lstb')} />
        ) : null}
        {tab === 'cockpit' && cockpitView === 'katalog-sonderausgaben' ? (
          <KatalogScreen entry="sonderausgaben" onDone={() => setCockpitView('arbeitstage')} onBack={() => setCockpitView('katalog-lebenslagen')} />
        ) : null}
        {tab === 'cockpit' && cockpitView === 'arbeitstage' ? (
          <ArbeitstageScreen onDone={() => setCockpitView('plausibilitaet')} onBack={() => setCockpitView('katalog-sonderausgaben')} />
        ) : null}
        {tab === 'cockpit' && cockpitView === 'plausibilitaet' ? (
          <PlausibilitaetScreen onBack={() => setCockpitView('main')} onDone={() => setCockpitView('veranlagungsartenvergleich')} />
        ) : null}
        {tab === 'cockpit' && cockpitView === 'veranlagungsartenvergleich' ? (
          <VeranlagungsartenvergleichScreen onBack={() => setCockpitView('plausibilitaet')} onDone={() => setCockpitView('main')} />
        ) : null}
        {tab === 'cockpit' && cockpitView === 'bescheid' ? (
          <BescheidScreen onDone={() => setCockpitView('main')} onBack={() => setCockpitView('main')} />
        ) : null}
        {tab === 'cockpit' && cockpitView === 'kapital' ? (
          <KapitalScreen onDone={() => setCockpitView('main')} onBack={() => setCockpitView('main')} />
        ) : null}
        {tab === 'cockpit' && cockpitView === 'vermietung' ? (
          <VermietungScreen onDone={() => setCockpitView('main')} onBack={() => setCockpitView('main')} />
        ) : null}
        {tab === 'cockpit' && cockpitView === 'kinder' ? (
          <KinderScreen onDone={() => setCockpitView('main')} onBack={() => setCockpitView('main')} />
        ) : null}
        {tab === 'cockpit' && cockpitView === 'eulen-modus' ? (
          <EulenModusScreen onDone={() => setCockpitView('main')} onBack={() => setCockpitView('main')} />
        ) : null}
        {tab === 'belege' ? <BelegeScreen /> : null}
        {tab === 'profil' && profilView === 'main' ? (
          <ProfilScreen
            onOpenDatenschutz={() => setProfilView('datenschutz')}
            onOpenSicherheit={() => setProfilView('sicherheit')}
            onOpenStammdaten={() => setProfilView('stammdaten')}
            onSignedOut={onSignedOut}
          />
        ) : null}
        {tab === 'profil' && profilView === 'datenschutz' ? (
          <DatenschutzScreen onZurueck={() => setProfilView('main')} onAccountDeleted={onSignedOut} />
        ) : null}
        {tab === 'profil' && profilView === 'stammdaten' ? <StammdatenScreen onZurueck={() => setProfilView('main')} /> : null}
        {tab === 'profil' && profilView === 'sicherheit' ? (
          <SicherheitScreen onZurueck={() => setProfilView('main')} />
        ) : null}
      </View>
      {zeigtTabBar ? <TabBar tabs={tabs} aktiv={tab} onWechsel={(id) => changeTab(id as Tab)} bottomInset={insets.bottom} /> : null}
    </View>
  )
}
