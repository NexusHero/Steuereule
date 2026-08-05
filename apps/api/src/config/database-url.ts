// The presence resolver for `DATABASE_URL`, mirroring the existing `resolve*(env)`
// idiom (resolveGuestSessionSecret / resolveFieldEncryptionKey / resolveBetterAuthSecret
// / resolveTrustedProxies): a small, pure, sync `resolve*(env)` function, config/env-driven
// (12-Factor III), no config framework, unit-testable by passing a plain object instead
// of relying on real `process.env`.
//
// Deliberately DIFFERENT from its siblings in one respect: it throws when unset in
// EVERY environment, not only `NODE_ENV === 'production'`. Those siblings each have a
// `DEV_ONLY_FALLBACK_*` that genuinely works without further setup (a fixed HMAC secret
// still signs/verifies correctly; a fixed encryption key still encrypts/decrypts
// correctly) — the fallback trades away a real production security property for local
// convenience, which is exactly what must not happen once `NODE_ENV=production`. There
// is no equivalent trade for `DATABASE_URL`: an invented connection string doesn't make
// the process work in dev either, it just defers the exact same failure a few
// milliseconds later, past this cheap sync check, into whatever the first DB-touching
// request happens to be (the bug this resolver exists to close — see
// `assert-database-reachable.ts`). So "missing" is treated as a configuration error
// everywhere, the same way `resolveCorsOrigins` departs from its siblings for the
// opposite reason (an empty allowlist is itself always safe) — see that resolver's own
// comment for the parallel.
//
// This resolver only asserts presence. It does not, and cannot, tell a valid connection
// string pointing at an unreachable host apart from one pointing at a live database —
// that is `assertDatabaseReachable()`'s job, a separate, I/O-bearing check with its own
// separate failure message (Musti's review: two distinct findings, never collapsed into
// one message — "configuration present" and "database reachable" are different claims).
export function resolveDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  // `.trim()` before the presence check (Musti's review, F2): `DATABASE_URL="   "`
  // is not "present" in any sense that helps — untrimmed, it slipped past this check
  // and only failed 5 seconds later, inside assertDatabaseReachable's I/O-bearing
  // probe, reported as a *reachability* defect. That's the wrong finding for what is
  // really a presence/format one, and it's exactly the two-findings-never-collapsed
  // line this file draws for itself above. A trimmed, non-empty value is returned
  // (not the raw untrimmed one) — incidental surrounding whitespace is never
  // intentional in a connection string either.
  const url = env.DATABASE_URL?.trim()
  if (url && url.length > 0) return url

  throw new Error(
    'DATABASE_URL must be set — every guest/registration/device-code path needs a database ' +
      'connection on its very first request, in every environment; unlike the guest-session ' +
      'secret or the field-encryption key there is no dev-only fallback that would actually ' +
      'work here (see apps/api/.env.example, or docker-compose.yml for the local stack’s value).',
  )
}
