// App root — the entry the whole thing boots into. Providers (i18n + Funke theme) wrap the first
// screen. Backend is intentionally not wired here yet (owned separately); the login is demo flow.
import { useState } from 'react'
import { View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { createAppI18n } from './src/i18n/app-i18n'
import { LoginScreen } from './src/screens/LoginScreen'

const i18n = createAppI18n('de')

export default function App() {
  // Minimal shell: after login/guest we land on a placeholder until the next screens are ported.
  const [angemeldet, setAngemeldet] = useState(false)

  return (
    <I18nextProvider i18n={i18n}>
      <ThemeProvider mode="light">
        <View style={{ flex: 1 }}>
          {angemeldet ? null : <LoginScreen onDone={() => setAngemeldet(true)} onGuest={() => setAngemeldet(true)} />}
          <StatusBar style="dark" />
        </View>
      </ThemeProvider>
    </I18nextProvider>
  )
}
