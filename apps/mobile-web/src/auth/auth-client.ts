import { createAuthClient } from 'better-auth/react'
import { twoFactorClient } from 'better-auth/client/plugins'
import { passkeyClient } from '@better-auth/passkey/client'

const AUTH_BASE_PATH = '/api/auth'

export function createAppAuthClient(baseUrl: string): ReturnType<typeof createAuthClient> {
  return createAuthClient({
    baseURL: baseUrl,
    basePath: AUTH_BASE_PATH,
    plugins: [twoFactorClient(), passkeyClient()],
    sessionOptions: { refetchOnWindowFocus: true },
  })
}

export type AppAuthClient = ReturnType<typeof createAppAuthClient>
