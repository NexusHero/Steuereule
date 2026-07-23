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

type Stage = 'splash' | 'login' | 'register' | 'onboarding' | 'done'

export default function App() {
  // Minimal shell: after onboarding we land on a placeholder until the next screens are ported.
  // Splash always leads to Login today — there's no session-detection mechanism yet to send a
  // returning user straight to Cockpit instead (REQ-009, pending); see SplashScreen's own notes.
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
              {stage === 'onboarding' ? <OnboardingScreen onDone={() => setStage('done')} /> : null}
              <StatusBar style="dark" />
            </View>
          </AuthClientProvider>
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>
  )
}
