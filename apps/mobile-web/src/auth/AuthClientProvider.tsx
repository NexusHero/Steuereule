import { createContext, useContext, type ReactNode } from 'react'
import type { AppAuthClient } from './auth-client'

const AuthClientContext = createContext<AppAuthClient | null>(null)
const ApiBaseUrlContext = createContext<string>('')

export interface AuthClientProviderProps {
  readonly client: AppAuthClient
  /** The API origin the client talks to, for addresses the user copies (the MCP endpoint). */
  readonly apiBaseUrl?: string
  readonly children: ReactNode
}

export function AuthClientProvider({ client, apiBaseUrl = '', children }: AuthClientProviderProps) {
  return (
    <ApiBaseUrlContext.Provider value={apiBaseUrl}>
      <AuthClientContext.Provider value={client}>{children}</AuthClientContext.Provider>
    </ApiBaseUrlContext.Provider>
  )
}

export function useApiBaseUrl(): string {
  return useContext(ApiBaseUrlContext)
}

export function useAuthClient(): AppAuthClient {
  const client = useContext(AuthClientContext)
  if (client === null) {
    throw new Error('useAuthClient() called outside an <AuthClientProvider> — wrap the app once, at the root.')
  }
  return client
}

/** The client where one is provided, else null: for parts that can do without it (the passwordless step-up). */
export function useOptionalAuthClient(): AppAuthClient | null {
  return useContext(AuthClientContext)
}
