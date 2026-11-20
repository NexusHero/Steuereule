// Shared by the tests of the app shell's routes: a stand-in screen that shows what the route gave it
// and lets a test press every callback the route wired, and the shell frame around AppTabs.
import { render, type RenderResult } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createNavigationContainerRef, getStateFromPath, NavigationContainer, type InitialState } from '@react-navigation/native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { http, HttpResponse } from 'msw'
import { createAppI18n } from '../i18n/app-i18n'
import { server } from '../test-msw-server'
import { AuthClientProvider } from '../auth/AuthClientProvider'
import { createAppAuthClient } from '../auth/auth-client'
import { AppTabs } from './AppTabs'
import { linking } from './linking'
import { ShellStateProvider, type ShellStateProviderProps } from './ShellState'
import type { AppTabParamList } from './routes'

export function signedIn(active = true) {
  server.use(http.get('*/api/auth/get-session', () => HttpResponse.json(active ? { user: { id: 'u1', email: 'nora@beispiel.de', name: 'Nora' }, session: { id: 's1' } } : null)))
}

export const navigationRef = createNavigationContainerRef<AppTabParamList>()

/** The state of the bottom tabs a deep link opens, as the linking config reads it. */
export function tabStateFor(path: string): InitialState {
  const root = getStateFromPath(path, linking.config)
  return root?.routes[0]?.state as InitialState
}

export function currentRoute(): { readonly name: string; readonly params: Record<string, unknown> | undefined } {
  const route = navigationRef.getCurrentRoute()
  return { name: route?.name ?? '', params: route?.params as Record<string, unknown> | undefined }
}

export function renderShell(initialState: InitialState | string, shell: Partial<ShellStateProviderProps> = {}): RenderResult {
  // A guest turned away remembers the address they asked for: the browser's, as in the shipped app.
  window.history.pushState({}, '', typeof initialState === 'string' ? initialState : '/app')
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <AuthClientProvider client={createAppAuthClient('http://localhost:3000')}>
            <ShellStateProvider onRegister={() => {}} onLogin={() => {}} onSignedOut={() => {}} {...shell}>
              <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                <NavigationContainer ref={navigationRef} initialState={typeof initialState === 'string' ? tabStateFor(initialState) : initialState}>
                  <AppTabs />
                </NavigationContainer>
              </SafeAreaProvider>
            </ShellStateProvider>
          </AuthClientProvider>
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}
