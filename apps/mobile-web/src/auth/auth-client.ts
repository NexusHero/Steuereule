import { createAuthClient } from 'better-auth/react'
import { twoFactorClient } from 'better-auth/client/plugins'
import { passkeyClient } from '@better-auth/passkey/client'
import { oauthProviderClient } from '@better-auth/oauth-provider/client'

const AUTH_BASE_PATH = '/api/auth'

export function createAppAuthClient(baseUrl: string): ReturnType<typeof createAuthClient> {
  return createAuthClient({
    baseURL: baseUrl,
    basePath: AUTH_BASE_PATH,
    // An assistant's sign-in (ADR-0052 §2): the login page sends the signed OAuth request along, and
    // better-auth answers with where the connection goes on (the consent), which the client follows.
    plugins: [twoFactorClient(), passkeyClient(), oauthProviderClient()],
    sessionOptions: { refetchOnWindowFocus: true },
  })
}

export type AppAuthClient = ReturnType<typeof createAppAuthClient>
