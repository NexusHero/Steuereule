// App root — the entry the whole thing boots into. Providers (i18n + Funke theme + TanStack
// Query) wrap the first screen. The Profile API origin is configured here, once, from the
// environment (12-Factor III) — the typed client itself carries no hard-coded host.
import { useState } from 'react'
import { View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { I18nextProvider, useTranslation } from 'react-i18next'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TabBar, TAB_ICON_PATHS, ThemeProvider, useTheme, type TabItem } from '@steuereule/ui'
import { configureApiClient } from '@steuereule/api-client'
import { createAppI18n } from './src/i18n/app-i18n'
import { APP_NS } from './src/i18n/resources'
import { createAppAuthClient } from './src/auth/auth-client'
import { AuthClientProvider } from './src/auth/AuthClientProvider'
import { TabIcon } from './src/icons/TabIcon'
import { SplashScreen } from './src/screens/SplashScreen'
import { LoginScreen } from './src/screens/LoginScreen'
import { RegistrierungScreen } from './src/screens/RegistrierungScreen'
import { OnboardingScreen } from './src/screens/OnboardingScreen'
import { CockpitScreen } from './src/screens/cockpit/CockpitScreen'
import { ProfilScreen } from './src/screens/ProfilScreen'
import { DatenschutzScreen } from './src/screens/DatenschutzScreen'

const i18n = createAppI18n('de')
const queryClient = new QueryClient()

// API base URL comes from EXPO_PUBLIC_API_BASE_URL; it falls back to http://localhost:3000
// for local dev, where the API runs on its own port. Set the env var per deployment so the
// app and API can be served from different origins.
const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000'
configureApiClient({ baseUrl: apiBaseUrl })

// better-auth mounts on the same API origin, at its own fixed `/api/auth/*` path (ADR-0012 §1) —
// so the auth client shares the Profile client's origin, constructed once here (better-auth's
// client has no post-construction reconfigure hook, unlike configureApiClient).
const authClient = createAppAuthClient(apiBaseUrl)

/** The linear entry flow, and then `app` — the tabbed shell everything else lives in. */
type Stage = 'splash' | 'login' | 'register' | 'onboarding' | 'app'

/** Only the tabs that have a real screen behind them. Grows as screens land. */
type Tab = 'cockpit' | 'profil'

export default function App() {
  // Splash always leads to Login today — there's no session-detection mechanism yet to send a
  // returning user straight into the app instead (REQ-009, pending); see SplashScreen's notes.
  const [stage, setStage] = useState<Stage>('splash')
  // Cockpit (REQ-001) is where onboarding lands, matching the DS reference's own default tab.
  const [tab, setTab] = useState<Tab>('cockpit')

  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider mode="light">
          <AuthClientProvider client={authClient}>
            <View style={{ flex: 1 }}>
              {stage === 'splash' ? <SplashScreen onAdvance={() => setStage('login')} /> : null}
              {stage === 'login' ? (
                <LoginScreen
                  onDone={() => setStage('onboarding')}
                  onGuest={() => setStage('onboarding')}
                  onRegister={() => setStage('register')}
                />
              ) : null}
              {stage === 'register' ? <RegistrierungScreen onDone={() => setStage('onboarding')} /> : null}
              {stage === 'onboarding' ? <OnboardingScreen onDone={() => setStage('app')} /> : null}
              {stage === 'app' ? (
                <TabbedShell
                  tab={tab}
                  onTabChange={setTab}
                  onSignedOut={() => {
                    // REQ-011 (ADR-0013): the server already cleared the session cookie on a
                    // successful DELETE /v1/account — the client must not keep showing a screen
                    // for an account that no longer exists, and must not let the next session
                    // (guest or a different account) see this one's cached data (Slice-1-retro
                    // class honesty bug). App owns both `stage` and `queryClient`, so it's the
                    // one place that can retire both at once.
                    queryClient.clear()
                    setTab('cockpit')
                    setStage('login')
                  }}
                />
              ) : null}
              <StatusBar style="dark" />
            </View>
          </AuthClientProvider>
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>
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
}

function TabbedShell({ tab, onTabChange, onSignedOut }: TabbedShellProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)

  // Datenschutz (REQ-011) is a screen reached *from* Profil, not a tab of its own (TAB_ORDNUNG
  // groups it with Profil in the DS reference) — so it's a sub-view owned by this shell, the
  // same way OnboardingScreen owns its own step state, rather than a sixth `Tab` value.
  const [profilView, setProfilView] = useState<'main' | 'datenschutz'>('main')

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
      id: 'profil',
      label: tr('tabs.profil'),
      icon: <TabIcon path={TAB_ICON_PATHS.profil} color={iconColor('profil')} />,
    },
  ]

  function changeTab(next: Tab) {
    // Leaving Profil always resets its sub-view — coming back to a half-open Datenschutz
    // screen via the tab bar would be a confusing, unrequested "resume" the DS never shows.
    setProfilView('main')
    onTabChange(next)
  }

  return (
    <View style={{ flex: 1 }}>
      {tab === 'cockpit' ? <CockpitScreen /> : null}
      {tab === 'profil' && profilView === 'main' ? <ProfilScreen onOpenDatenschutz={() => setProfilView('datenschutz')} /> : null}
      {tab === 'profil' && profilView === 'datenschutz' ? (
        <DatenschutzScreen onZurueck={() => setProfilView('main')} onAccountDeleted={onSignedOut} />
      ) : null}
      {/* Datenschutz is a drill-down screen (its own back button, like Onboarding/Login), not
          a peer of the tabs — hiding the bar here matches that and avoids a confusing second
          way to leave a screen with a destructive, in-progress delete flow on it. */}
      {profilView === 'main' ? <TabBar tabs={tabs} aktiv={tab} onWechsel={(id) => changeTab(id as Tab)} /> : null}
    </View>
  )
}
