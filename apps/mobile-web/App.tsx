// App root — the entry the whole thing boots into. Providers (i18n + Funke theme) wrap the first
// screen. Backend is intentionally not wired here yet (owned separately); login + onboarding are
// demo flow.
import { useState } from 'react'
import { View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { createAppI18n } from './src/i18n/app-i18n'
import { LoginScreen } from './src/screens/LoginScreen'
import { OnboardingScreen } from './src/screens/OnboardingScreen'

const i18n = createAppI18n('de')

type Stage = 'login' | 'onboarding' | 'done'

export default function App() {
  // Minimal shell: after onboarding we land on a placeholder until the next screens are ported.
  const [stage, setStage] = useState<Stage>('login')

  return (
    <I18nextProvider i18n={i18n}>
      <ThemeProvider mode="light">
        <View style={{ flex: 1 }}>
          {stage === 'login' ? <LoginScreen onDone={() => setStage('onboarding')} onGuest={() => setStage('onboarding')} /> : null}
          {stage === 'onboarding' ? <OnboardingScreen onDone={() => setStage('done')} /> : null}
          <StatusBar style="dark" />
        </View>
      </ThemeProvider>
    </I18nextProvider>
  )
}
