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

  // `return raw`, never a trimmed or normalised copy (Musti's review, F5): `PrismaService`
  // extends `PrismaClient` with no datasource override, so the app connects with
  // `env("DATABASE_URL")` read RAW via `schema.prisma`, never through this function — any
  // other return value here checks a different string than the app connects with.
  //
  // This resolver reads the environment AFTER `@prisma/client`'s import has merged
  // `apps/api/.env` into it (`assert-database-reachable.ts` imports it at module top level).
  // Measured: that merge only fills what is UNSET and never overrides, so an operator-set
  // value survives byte-for-byte — guard and app still read one identical string. Part of
  // why the paragraph above holds, not an exception to it (F7).
  //
  // Leading whitespace: measured to fail on BOTH paths (Prisma 6.19.3) → reject, fast and
  // correctly labeled, instead of the same failure 5s later mislabeled as unreachable (F2).
  // Trailing whitespace/newline: measured to SUCCEED on both → accept; it's the ordinary
  // Kubernetes Secret shape (ADR-049, k3s on Hetzner). The full weighing behind that choice
  // lives in this PR's commit trail, not here (F6/F9).
  if (raw !== raw.replace(/^\s+/, '')) {
    throw new Error(
      'DATABASE_URL has leading whitespace — this value cannot connect as written. Measured against ' +
        'Prisma 6.19.3, leading whitespace fails identically on both paths (this guard’s probe and the ' +
        'connection PrismaService makes), so refusing now is the same failure you would get anyway, ' +
        'five seconds sooner and correctly labeled instead of reported as unreachable. Trailing ' +
        'whitespace — including the trailing newline `kubectl create secret --from-file` and a YAML ' +
        '`|` block append — is a different case: it works on both paths and is NOT rejected. Remove ' +
        'the LEADING whitespace at the source (your .env file or shell export).',
    )
  }

  return raw
}
