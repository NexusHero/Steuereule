const DEV_ONLY_FALLBACK_SECRET = 'dev-only-insecure-better-auth-secret-do-not-use-in-production'
const DEV_ONLY_FALLBACK_URL = 'http://localhost:3000'
const DEV_ONLY_FALLBACK_WEB_APP_URL = 'http://localhost:8081'

const DEV_ONLY_GOOGLE_CLIENT_ID = 'dev-only-google-client-id'
const DEV_ONLY_GOOGLE_CLIENT_SECRET = 'dev-only-google-client-secret'

export function resolveBetterAuthSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.BETTER_AUTH_SECRET
  if (secret && secret.length > 0) return secret
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'BETTER_AUTH_SECRET must be set in production — refusing to sign/encrypt real ' +
        'sessions under a guessable default secret.',
    )
  }
  return DEV_ONLY_FALLBACK_SECRET
}

export function resolveBetterAuthUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.BETTER_AUTH_URL
  if (url && url.length > 0) return url
  if (env.NODE_ENV === 'production') {
    throw new Error('BETTER_AUTH_URL must be set in production.')
  }
  return DEV_ONLY_FALLBACK_URL
}

export function resolveWebAppUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.WEB_APP_URL
  if (url && url.length > 0) return url
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'WEB_APP_URL must be set in production — without it the device-authorization QR ' +
        "points at the API's own origin instead of the web app's.",
    )
  }
  return DEV_ONLY_FALLBACK_WEB_APP_URL
}

export function resolveGoogleClientId(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const id = env.GOOGLE_CLIENT_ID
  if (id && id.length > 0) return id
  if (env.NODE_ENV === 'production') {
    return undefined
  }
  return DEV_ONLY_GOOGLE_CLIENT_ID
}

export function resolveGoogleClientSecret(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const secret = env.GOOGLE_CLIENT_SECRET
  if (secret && secret.length > 0) return secret
  if (env.NODE_ENV === 'production') {
    return undefined
  }
  return DEV_ONLY_GOOGLE_CLIENT_SECRET
}

export function resolveAppleSignInEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.APPLE_SIGN_IN_ENABLED === 'true'
}

export function resolveAppleClientId(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const id = env.APPLE_CLIENT_ID
  return id && id.length > 0 ? id : undefined
}

export function resolveAppleClientSecret(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const secret = env.APPLE_CLIENT_SECRET
  return secret && secret.length > 0 ? secret : undefined
}
