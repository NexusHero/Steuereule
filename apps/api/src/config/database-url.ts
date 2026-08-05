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
  const raw = env.DATABASE_URL

  if (!raw || raw.trim().length === 0) {
    throw new Error(
      'DATABASE_URL must be set — every guest/registration/device-code path needs a database ' +
        'connection on its very first request, in every environment; unlike the guest-session ' +
        'secret or the field-encryption key there is no dev-only fallback that would actually ' +
        'work here (see apps/api/.env.example, or docker-compose.yml for the local stack’s value).',
    )
  }

  // `return raw` below — never a trimmed or otherwise normalised copy — is what
  // actually closes the guard-vs-app divergence (Musti's review, F5): this
  // resolver's return value is NOT the only place `DATABASE_URL` gets read.
  // `PrismaService` extends `PrismaClient` with no explicit datasource override, so
  // it resolves `env("DATABASE_URL")` straight out of `schema.prisma` — the RAW
  // process environment, never through this function. Any version of this resolver
  // that returned a different string than that raw value (a trim, a normalisation)
  // would make the guard check one string while the app connects with another;
  // measured, end to end, with a real server and a real database, is exactly how a
  // trim-and-return version of this function regressed into a silent 500 on the
  // first DB-touching request after a clean boot.
  //
  // Leading whitespace only, not surrounding (Musti's review, F6): measured against
  // Prisma 6.19.3 on both consumption paths — this guard's own reachability probe
  // AND PrismaService's env()-sourced connection — leading whitespace makes BOTH
  // fail identically (no divergence either way), while trailing whitespace,
  // including a trailing newline, makes BOTH succeed identically. Rejecting leading
  // whitespace converts a config that's doomed on both paths anyway from a slow (5s
  // I/O), mislabeled reachability failure into a fast, correctly-labeled
  // presence/format one — the same reasoning that motivated this whole check (F2).
  // Rejecting trailing whitespace would buy nothing (nothing is silently succeeding
  // that shouldn't) while actively refusing a configuration proven to work — and a
  // trailing newline is the single most common shape a Kubernetes Secret value
  // arrives in (`kubectl create secret generic --from-file=` appends one; so does a
  // YAML `|` block literal), which matters concretely here because ADR-049 confirms
  // k3s on Hetzner as this project's deployment target. A stricter, "reject
  // anything padded" version would be defensive against Prisma someday changing
  // that trailing-whitespace tolerance — but it doesn't need to be: the
  // reachability probe just below runs the real, current Prisma connection logic
  // against this exact string on every boot, so if a future Prisma version ever
  // does stop tolerating it, that probe reports it honestly as a reachability
  // failure at that point — nothing here has to predict or hardcode library
  // behaviour that can change out from under it.
  if (raw !== raw.replace(/^\s+/, '')) {
    throw new Error(
      'DATABASE_URL has leading whitespace — refusing to silently strip it, since that would make ' +
        'this check pass a different string than the one PrismaClient actually connects with (it reads ' +
        'DATABASE_URL straight from the raw process environment via schema.prisma, not through this ' +
        'function). Remove the leading whitespace at the source (your .env file or shell export).',
    )
  }

  return raw
}
