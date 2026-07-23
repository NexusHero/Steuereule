// App root — the entry the whole thing boots into. Providers (i18n + Funke theme + TanStack
// Query) wrap the first screen. The Profile API origin is configured here, once, from the
// environment (12-Factor III) — the typed client itself carries no hard-coded host.
import { useState } from 'react'
import { View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { I18nextProvider } from 'react-i18next'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from '@steuereule/ui'
import { configureApiClient } from '@steuereule/api-client'
import { createAppI18n } from './src/i18n/app-i18n'
import { createAppAuthClient } from './src/auth/auth-client'
import { AuthClientProvider } from './src/auth/AuthClientProvider'
import { SplashScreen } from './src/screens/SplashScreen'
import { LoginScreen } from './src/screens/LoginScreen'
import { RegistrierungScreen } from './src/screens/RegistrierungScreen'
import { OnboardingScreen } from './src/screens/OnboardingScreen'
import { CockpitScreen } from './src/screens/cockpit/CockpitScreen'

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

type Stage = 'splash' | 'login' | 'register' | 'onboarding' | 'cockpit'

export default function App() {
  // After onboarding, the Cockpit (REQ-001) is the app's home screen — the first slice of it
  // (hero estimate card only, ADR-0005 walking skeleton). Widens screen by screen from here.
  // Profil (REQ-013) landed as a temporary post-onboarding placeholder while Cockpit was still
  // in flight (see its own commit); now that Cockpit has landed as the intended home screen, it
  // resumes that spot. ProfilScreen itself is untouched and still fully covered by its own
  // ProfilScreen.test.tsx — it isn't wired into this linear stage shell because the DS Cockpit
  // reference reaches Profil via an open-item link ("Stammdaten" -> profil), and that in-app
  // navigation is out of scope for this walking-skeleton slice (see CockpitScreen's own notes);
  // it'll get a real route once that navigation exists. Splash always leads to Login today —
  // there's no session-detection mechanism yet to send a returning user straight to Cockpit
  // instead (REQ-009, pending); see SplashScreen's own notes.
  const [stage, setStage] = useState<Stage>('splash')

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
              {stage === 'onboarding' ? <OnboardingScreen onDone={() => setStage('cockpit')} /> : null}
              {stage === 'cockpit' ? <CockpitScreen /> : null}
              <StatusBar style="dark" />
            </View>
          </AuthClientProvider>
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>
  )
}
