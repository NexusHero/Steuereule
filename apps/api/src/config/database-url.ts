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

  // Reject surrounding whitespace rather than trim it away (Musti's review, F5 —
  // fixing a regression the first version of the F2 fix introduced): this resolver's
  // return value is NOT the only place `DATABASE_URL` gets read. `PrismaService`
  // extends `PrismaClient` with no explicit datasource override, so it resolves
  // `env("DATABASE_URL")` straight out of `schema.prisma` — the RAW process
  // environment, never through this function. A version of this resolver that
  // trimmed and returned a different string than that raw value would make the guard
  // check one string while the app connects with another; measured, end to end, with
  // a real server and a real database: `DATABASE_URL="  postgres://…"` (leading
  // whitespace only) passed this check when it trimmed-and-returned, then 500'd on
  // the very first DB-touching request anyway — Prisma tolerates trailing whitespace
  // in `env()`-sourced values but not leading. Silently normalising here would have
  // to mutate `process.env` itself to keep the two paths looking at the same string,
  // which breaks the pure `resolve*(env)` contract every sibling in this codebase
  // relies on. Rejecting keeps the contract pure and keeps guard and app looking at
  // the identical value: an operator who fat-fingers whitespace into their `.env`
  // gets a synchronous, no-I/O, named config defect instead of either variant of the
  // wrong-finding bug this file already fixed once.
  if (raw !== raw.trim()) {
    throw new Error(
      'DATABASE_URL has surrounding whitespace — refusing to silently strip it, since that would ' +
        'make this check pass a different string than the one PrismaClient actually connects with ' +
        '(it reads DATABASE_URL straight from the raw process environment via schema.prisma, not ' +
        'through this function). Remove the surrounding whitespace at the source (your .env file or ' +
        'shell export).',
    )
  }

  return raw
}
