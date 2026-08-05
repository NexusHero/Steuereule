// resolveDatabaseUrl — a pure function taking `env` as a parameter, same shape as every
// other resolve*(env) test in this codebase (trusted-proxies.test.ts,
// better-auth.test.ts). No server, no DB needed — this is the "presence" finding only;
// the "reachability" finding lives in database-boot-guard.test.ts, which has to break
// out of this file's structure (a real spawned process) to reach it at all, because
// vitest.config.ts injects a syntactically-valid DATABASE_URL into every test file's
// env before any test body runs — no in-process test here could ever observe "unset".
import { describe, expect, it } from 'vitest'
import { resolveDatabaseUrl } from '../../src/config/database-url.js'

describe('resolveDatabaseUrl', () => {
  it('returns the configured value', () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: 'postgresql://u:p@localhost:5432/db' })).toBe(
      'postgresql://u:p@localhost:5432/db',
    )
  })

  it('throws the presence finding when unset — in every environment, not only production (no dev-only fallback exists for this value)', () => {
    expect(() => resolveDatabaseUrl({})).toThrow(/DATABASE_URL must be set/)
    expect(() => resolveDatabaseUrl({ NODE_ENV: 'test' })).toThrow(/DATABASE_URL must be set/)
    expect(() => resolveDatabaseUrl({ NODE_ENV: 'production' })).toThrow(/DATABASE_URL must be set/)
  })

  it('throws when set to an empty string', () => {
    expect(() => resolveDatabaseUrl({ DATABASE_URL: '' })).toThrow(/DATABASE_URL must be set/)
  })

  // F2 (Musti's review): a whitespace-only value used to pass this check — `.length > 0`
  // is true for `'   '` — and only failed 5 seconds later inside the reachability
  // probe's I/O, reported as the wrong finding (reachability instead of presence).
  it('throws the presence finding for a whitespace-only value, not a reachability failure 5s later', () => {
    expect(() => resolveDatabaseUrl({ DATABASE_URL: '   ' })).toThrow(/DATABASE_URL must be set/)
    expect(() => resolveDatabaseUrl({ DATABASE_URL: '\t\n' })).toThrow(/DATABASE_URL must be set/)
  })

  // F5 (Musti's review): the first version of this fix trimmed-and-returned a padded
  // value — which made this resolver check a different string than the one
  // PrismaService actually connects with (it reads DATABASE_URL raw, via
  // schema.prisma's env(), never through this function). Measured, real server, real
  // database: a leading-whitespace DATABASE_URL passed the trim-based check, then
  // 500'd on the first DB-touching request anyway — silently reintroducing the exact
  // bug this file exists to close. Rejecting instead of normalising keeps guard and
  // app looking at the identical value.
  it('rejects leading whitespace instead of silently stripping it — stripping would check a different string than PrismaService actually connects with', () => {
    expect(() => resolveDatabaseUrl({ DATABASE_URL: '  postgresql://u:p@localhost:5432/db' })).toThrow(
      /leading whitespace/,
    )
    expect(() => resolveDatabaseUrl({ DATABASE_URL: '\tpostgresql://u:p@localhost:5432/db' })).toThrow(
      /leading whitespace/,
    )
  })

  // F6 (Musti's review): measured against real Prisma 6.19.3 on both consumption
  // paths (this resolver's own reachability probe, and PrismaService's raw
  // env()-sourced connection) — leading whitespace makes both fail identically
  // (no divergence, either way); trailing whitespace, including a trailing newline,
  // makes both SUCCEED identically. A trailing newline is the single most common
  // shape a Kubernetes Secret value arrives in (`kubectl create secret generic
  // --from-file=` appends one, so does a YAML `|` block literal — ADR-049 confirms
  // k3s on Hetzner as the deployment target). Rejecting it would refuse a
  // configuration proven to work end to end, for zero correctness benefit — nothing
  // is silently succeeding that shouldn't.
  it('does NOT reject trailing whitespace, including a trailing newline (the Kubernetes Secret shape) — measured to work identically on both paths', () => {
    const base = 'postgresql://u:p@localhost:5432/db'
    expect(resolveDatabaseUrl({ DATABASE_URL: `${base}  ` })).toBe(`${base}  `)
    expect(resolveDatabaseUrl({ DATABASE_URL: `${base}\n` })).toBe(`${base}\n`)
  })

  it('returns a value with no leading whitespace completely untouched', () => {
    const value = 'postgresql://u:p@localhost:5432/db?schema=public'
    expect(resolveDatabaseUrl({ DATABASE_URL: value })).toBe(value)
  })
})
