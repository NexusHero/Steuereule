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
