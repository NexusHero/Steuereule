// App root — the entry the whole thing boots into. Providers (i18n + Funke theme + TanStack
// Query) wrap the first screen. The Profile API origin is configured here, once, from the
// environment (12-Factor III) — the typed client itself carries no hard-coded host.
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { I18nextProvider, useTranslation } from 'react-i18next'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NavigationContainer, type LinkingOptions } from '@react-navigation/native'
import { createNativeStackNavigator, type NativeStackScreenProps } from '@react-navigation/native-stack'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { TabBar, TAB_ICON_PATHS, ThemeProvider, useTheme, type TabItem } from '@steuereule/ui'
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
import { betreiberAusUmgebung, RECHTLICHE_SEITEN, type RechtlicheSeite } from './src/screens/rechtliches/texte'
import { KontoWandScreen, pfadAusAntworten, type FunnelPfad } from './src/screens/funnel/KontoWandScreen'
import { useAccountSession } from './src/auth/useAccountSession'

const i18n = createAppI18n('de')
// Defaults live in ./src/query-client so they can be asserted; a bare `new QueryClient()` left
// a first-paint query spinning for ~30s against an unreachable API (#307).
const queryClient = new QueryClient({ defaultOptions: APP_QUERY_DEFAULTS })

// API base URL comes from EXPO_PUBLIC_API_BASE_URL; it falls back to http://localhost:3000
// for local dev, where the API runs on its own port. Set the env var per deployment so the
// app and API can be served from different origins.
const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000'
configureApiClient({ baseUrl: apiBaseUrl })

// better-auth mounts on the same API origin, at its own fixed `/api/auth/*` path (ADR-0012 §1) —
// so the auth client shares the Profile client's origin, constructed once here (better-auth's
// client has no post-construction reconfigure hook, unlike configureApiClient).
const authClient = createAppAuthClient(apiBaseUrl)

/**
 * The app's real, URL-addressable route table (ADR-0023, #238 task 1b) — what `Stage` used to be
 * as a `useState` union. Retired in its favour: every one of these is now a real, externally
 * openable URL, not in-memory state. `App` is a real, plain data shape for one entry; params stay
 * `undefined` everywhere today because nothing here reads one yet — except `Device`, #238's own
 * device-authorization route, whose `user_code` param is exactly what a phone's camera opens the
 * QR/link to (`verificationUri`, apps/api/src/auth/better-auth.ts: `${WEB_APP_URL}/device`).
 */
type RootStackParamList = {
  Splash: undefined
  Login: undefined
  Registrierung: undefined
  Onboarding: undefined
  /** ADR-0045: `start: 'interview'` opens the Minimal-Gate directly (the guest's value-first entry). */
  App: { start?: 'interview' } | undefined
  Device: { user_code?: string } | undefined
  Rechtliches: { seite: RechtlicheSeite }
  /** ADR-0050 — also the Stripe checkout's return URL (`?zahlung=erfolg|abbruch`). */
  Ausdruck: { jahr: string; zahlung?: string }
}

const RootStack = createNativeStackNavigator<RootStackParamList>()

/** Maps every route above to a path — the mechanism AC-1 (#238) needs: a URL that resolves to a
 * screen through a real router, not a query-param stand-in. `prefixes` stays empty; this app is
 * `web.output: "single"` and RN-Web's own history integration needs no origin allowlist here.
 * `Device: 'device'` matches `verificationUri`'s own fixed path exactly (Robin's fix, #238) —
 * `user_code` needs no explicit `parse` config, since `getStateFromPath`'s query-string parsing
 * lands it in `route.params` on its own (confirmed directly against the installed
 * `@react-navigation/core`, not assumed from its types). */
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
    },
  },
}

/** Only the tabs that have a real screen behind them. Grows as screens land. */
type Tab = 'cockpit' | 'belege' | 'profil'

/**
 * Composition root only — this is the one file in `apps/mobile-web` allowed to import
 * `@react-navigation/*` (ADR-0023). Every `*Screen` component below keeps taking plain callback
 * props exactly as before; the route wrapper components in this file are what translate a screen's
 * `onDone`/`onGuest`/… into a `navigation.replace`/`navigate` call, so a screen itself never sees
 * a navigation object, a route param, or a router import.
 */
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

// Splash always leads to Login today — there's no session-detection mechanism yet to send a
// returning user straight into the app instead (REQ-009, pending); see SplashScreen's notes.
// `replace`, not `navigate`: Splash is a one-time intro, never a page a back button should return
// to (matches the old `setStage` overwrite semantics exactly).
function SplashRoute({ navigation }: NativeStackScreenProps<RootStackParamList, 'Splash'>) {
  return <SplashScreen onAdvance={() => navigation.replace('Login')} />
}

// `replace` throughout, not `navigate`: none of these screens offers a way back to the one
// before it today (RegistrierungScreen has no "back to Login" affordance, matching the old
// `Stage` union, which never had a history to go back through either — `useState` only ever
// held the current value). `replace` reproduces that exactly and, as a side effect, avoids
// `native-stack`'s backgrounded-but-still-mounted previous screen (kept resident for the native
// slide-back transition) ever sitting in the DOM next to the active one.
function LoginRoute({ navigation }: NativeStackScreenProps<RootStackParamList, 'Login'>) {
  return (
    <LoginScreen
      // ADR-0045 (value-first funnel): a returning account goes straight to the app (its
      // profile already exists; Profil edits it), and a guest goes straight into the three
      // Minimal-Gate questions — no name/Steuer-ID form before the user has seen any value.
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
      // AC-2 (Phase 0.3): the reverse of Login's "Neu hier? Konto anlegen" — a user who reached
      // Registrierung and changed their mind can go back instead of being stuck on a dead branch.
      onLogin={() => navigation.replace('Login')}
    />
  )
}

function OnboardingRoute({ navigation }: NativeStackScreenProps<RootStackParamList, 'Onboarding'>) {
  return <OnboardingScreen onDone={() => navigation.replace('App')} />
}

// #238 AC-1: a real route, resolving the URL a phone's camera actually opens. No `navigation`
// use inside `DeviceScreen` itself (AC-2/AC-7's embedded-Login mechanism deliberately never
// navigates) — this wrapper's only job is handing the parsed `user_code` param down.
// ADR-0050: `navigate` (not `replace`) so "Zurück" returns to wherever the link was tapped; a
// legal page opened directly by URL has no history and falls back to Login. An unknown
// `seite` from a hand-typed URL shows the Impressum rather than a blank screen.
// Each EXPO_PUBLIC_* is spelled out: Expo inlines only direct `process.env.EXPO_PUBLIC_X`
// reads at build time — passing `process.env` itself would leave the web bundle empty.
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

// ADR-0050: "Angaben ergänzen" opens the Stammdaten form in place, so returning from it lands
// back on the Ausdruck with the refreshed gap list instead of somewhere in the tab shell.
function AusdruckRoute({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'Ausdruck'>) {
  const [ansicht, setAnsicht] = useState<'ausdruck' | 'stammdaten'>('ausdruck')
  const jahr = Number(route.params?.jahr)
  // A hand-typed URL with no valid year has nothing to show: back to the Cockpit.
  useEffect(() => {
    if (!Number.isInteger(jahr)) navigation.replace('App')
  }, [jahr, navigation])
  if (!Number.isInteger(jahr)) return null
  if (ansicht === 'stammdaten') return <StammdatenScreen onZurueck={() => setAnsicht('ausdruck')} />
  const zahlung = route.params?.zahlung
  return (
    <AusdruckScreen
      jahr={jahr}
      {...(zahlung === 'erfolg' || zahlung === 'abbruch' ? { zahlung } : {})}
      onZurueck={() => (navigation.canGoBack() ? navigation.goBack() : navigation.replace('App'))}
      onAngabenErgaenzen={() => setAnsicht('stammdaten')}
    />
  )
}

function DeviceRoute({ route }: NativeStackScreenProps<RootStackParamList, 'Device'>) {
  return <DeviceScreen userCode={route.params?.user_code} />
}

// Cockpit (REQ-001) is where onboarding lands, matching the DS reference's own default tab. Tab
// state stays local to this route, exactly as it lived on `App` before — the tab bar was never a
// `Stage` transition, so it stays in-memory rather than gaining a URL of its own here.
function AppRoute({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'App'>) {
  const [tab, setTab] = useState<Tab>('cockpit')

  return (
    <TabbedShell
      tab={tab}
      onTabChange={setTab}
      startInInterview={route.params?.start === 'interview'}
      // ADR-0045: the Konto-Wand's two ways to an account. Registrierung -> Onboarding (name,
      // Steuer-ID skippable) -> App; the guest's interview answers move over on that sign-up.
      onRegister={() => navigation.replace('Registrierung')}
      onLogin={() => navigation.replace('Login')}
      onOpenAusdruck={(jahr) => navigation.navigate('Ausdruck', { jahr: String(jahr) })}
      onSignedOut={() => {
        // REQ-011 (ADR-0013): the server already cleared the session cookie on a
        // successful DELETE /v1/account — the client must not keep showing a screen
        // for an account that no longer exists, and must not let the next session
        // (guest or a different account) see this one's cached data (Slice-1-retro
        // class honesty bug). App owns both `stage` and `queryClient`, so it's the
        // one place that can retire both at once.
        queryClient.clear()
        setTab('cockpit')
        navigation.replace('Login')
      }}
    />
  )
}

/**
 * The tabbed part of the app: a screen plus the design system's floating tab bar.
 *
 * Split out as its own component so it can read the theme and the translations — both come
 * from providers that `App` itself mounts, and a component cannot consume context it
 * provides in the same render.
 *
 * **Only tabs with a screen behind them are listed.** The DS reference carries five
 * (cockpit, belege, berater, jahr, profil), but Belege, Berater and Jahr have not been
 * built — offering them would be exactly the dead affordance the honesty rule forbids. Each
 * gets its tab when its screen lands.
 */
interface TabbedShellProps {
  readonly tab: Tab
  readonly onTabChange: (tab: Tab) => void
  readonly onSignedOut: () => void
  /** ADR-0045 — open the Minimal-Gate first instead of the Cockpit (guest entry). */
  readonly startInInterview?: boolean
  readonly onRegister?: () => void
  readonly onLogin?: () => void
  /** ADR-0050: the Formular-Ausdruck is its own route (the Stripe checkout returns to it). */
  readonly onOpenAusdruck?: (jahr: number) => void
}

function TabbedShell({ tab, onTabChange, onSignedOut, startInInterview = false, onRegister = () => {}, onLogin = () => {}, onOpenAusdruck }: TabbedShellProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  // ADR-0045: only a real account session continues into the (account-only) verticals after
  // the Minimal-Gate; anyone else — a guest, or a session we can't confirm — sees the Konto-Wand.
  const { state: sessionState } = useAccountSession()
  const [funnelPfad, setFunnelPfad] = useState<FunnelPfad>('angestellte')

  // Datenschutz (REQ-011) is a screen reached *from* Profil, not a tab of its own (TAB_ORDNUNG
  // groups it with Profil in the DS reference) — so it's a sub-view owned by this shell, the
  // same way OnboardingScreen owns its own step state, rather than a sixth `Tab` value.
  const [profilView, setProfilView] = useState<'main' | 'datenschutz' | 'sicherheit' | 'stammdaten'>('main')
  // The Minimal-Gate (REQ-015/#318 task 2) is reached from Cockpit's own CTA the same way —
  // a sub-view of the Cockpit tab, not a top-level route (ADR-0023: only the composition root
  // touches `@react-navigation/*`, and this is exactly the Datenschutz precedent applied here).
  // Unlike Datenschutz, the tab bar stays visible: nothing about the Minimal-Gate is
  // destructive/in-progress the way account deletion is, so switching tabs mid-flow is a
  // legitimate, honest way out — no separate "exit" affordance is invented for it (the DS
  // reference has none, and #318 doesn't ask for one).
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
  >(startInInterview ? 'interview' : 'main')

  // The active tab's icon sits on the lime pill and needs the ink colour to stay legible;
  // the others sit on card white. Mirrors `.fk-tab`/`.fk-tab[aria-current]` in the DS.
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
    // Leaving Profil/Cockpit always resets their sub-view — coming back to a half-open
    // Datenschutz/Interview screen via the tab bar would be a confusing, unrequested "resume"
    // the DS never shows.
    setProfilView('main')
    setCockpitView('main')
    onTabChange(next)
  }

  return (
    <View style={{ flex: 1 }}>
      {tab === 'cockpit' && cockpitView === 'main' ? <CockpitScreen
          onOpenInterview={() => setCockpitView('interview')}
          onOpenBescheid={() => setCockpitView('bescheid')}
          onOpenKapital={() => setCockpitView('kapital')}
          onOpenVermietung={() => setCockpitView('vermietung')}
          {...(onOpenAusdruck ? { onOpenAusdruck } : {})}
        /> : null}
      {tab === 'cockpit' && cockpitView === 'interview' ? (
        // The Minimal-Gate routes to the right vertical from the answers — Rente (product
        // ADR-034) goes to the Rentner mask, work in CH (ADR-029) to the Grenzgänger screen,
        // otherwise the Angestellte vertical continues with the LStB mask (ticket 15).
        <InterviewScreen
          onDone={(answers) => {
            const pfad = pfadAusAntworten(answers)
            if (sessionState.status !== 'signed-in') {
              setFunnelPfad(pfad)
              setCockpitView('konto-wand')
              return
            }
            setCockpitView(pfad === 'rente' ? 'rente' : pfad === 'ch' ? 'ch' : 'lstb')
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
      {/* Datenschutz is a drill-down screen (its own back button, like Onboarding/Login), not
          a peer of the tabs — hiding the bar here matches that and avoids a confusing second
          way to leave a screen with a destructive, in-progress delete flow on it. */}
      {profilView === 'main' ? <TabBar tabs={tabs} aktiv={tab} onWechsel={(id) => changeTab(id as Tab)} /> : null}
    </View>
  )
}
