// Dependency-injects the one `AppAuthClient` instance the app constructs (in App.tsx, from env —
// see auth-client.ts) down to the Login/Registrierung screens, exactly like ThemeProvider/
// I18nextProvider/QueryClientProvider already do for their own singletons. Screens call
// `useAuthClient()` instead of importing a hidden module-level singleton, which keeps them
// testable: a test constructs its own client pointed at the MSW-mocked origin and renders its
// own provider, with no shared global state leaking between tests.
import { createContext, useContext, type ReactNode } from 'react'
import type { AppAuthClient } from './auth-client'

const AuthClientContext = createContext<AppAuthClient | null>(null)

export interface AuthClientProviderProps {
  readonly client: AppAuthClient
  readonly children: ReactNode
}

export function AuthClientProvider({ client, children }: AuthClientProviderProps) {
  return <AuthClientContext.Provider value={client}>{children}</AuthClientContext.Provider>
}

export function useAuthClient(): AppAuthClient {
  const client = useContext(AuthClientContext)
  if (client === null) {
    throw new Error('useAuthClient() called outside an <AuthClientProvider> — wrap the app once, at the root.')
  }
  return client
}
