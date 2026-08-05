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
  it('returns the configured value untouched', () => {
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
})
