/** A loopback host: nothing beyond this machine reaches it. */
export function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

export function isLoopbackUrl(value: string | undefined): boolean {
  if (!value) return false
  try {
    return isLoopbackHost(new URL(value).hostname)
  } catch {
    return false
  }
}

/**
 * The local production-shaped compose stack (ADR-0026) runs `NODE_ENV=production` on localhost with synthetic
 * values. It counts as local only when the API is not on Cloud Run (`K_SERVICE` unset) and every origin it
 * serves is a loopback address: nothing beyond the machine can reach it, so a published key protects nothing
 * that matters. Any public origin makes the run a deployment.
 */
export function isLocalProductionStack(env: NodeJS.ProcessEnv): boolean {
  if (env.K_SERVICE) return false
  const origins = [env.BETTER_AUTH_URL, env.WEB_APP_URL, ...(env.CORS_ALLOWED_ORIGINS ?? '').split(',').map((entry) => entry.trim()).filter(Boolean)]
  return origins.every(isLoopbackUrl)
}

/** A run nobody beyond this machine depends on: development, tests, or the local production-shaped stack. */
export function isLocalRun(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV !== 'production' || isLocalProductionStack(env)
}
