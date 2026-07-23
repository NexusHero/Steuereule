// The resolver for the credentialed-CORS allowlist (ADR-0011), mirroring
// resolveGuestSessionSecret() in ../auth/guest-session.ts and resolveFieldEncryptionKey()
// in ../prisma/field-encryption-key.ts: a small `resolve*(env)` function, config/env-driven
// (12-Factor III), no config framework.
//
// `CORS_ALLOWED_ORIGINS` is a comma-separated exact-match allowlist (e.g. the local Expo
// web dev origin plus the deployed web origin). The array is handed straight to Fastify's
// CORS plugin (via Nest's `enableCors({ origin, credentials: true })`) which, given an
// array of exact origin strings, echoes back only the incoming `Origin` header when it is
// a member — never `*`, never a blanket reflection of any arbitrary Origin. An unset/empty
// env var resolves to an empty allowlist, which grants nothing — fail-closed, never a
// permissive fallback (unlike the guest-session secret/field-encryption key, there is no
// dev-only default here: a same-origin local dev setup needs no CORS grant at all, so
// "empty" is *itself* the correct, safe default in every environment).
export function resolveCorsOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.CORS_ALLOWED_ORIGINS
  if (!raw) return []

  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
}
