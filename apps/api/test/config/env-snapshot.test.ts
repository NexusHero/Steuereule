// namesPresentIn — a pure function, same "resolve*(env)" shape every sibling in this
// directory uses, so this is testable with plain objects and needs no real
// `process.env`. What CANNOT be unit-tested here, by construction, is
// PRESENT_BEFORE_PRISMA_COULD_LOAD itself — the module-level snapshot only means
// anything if it is captured before `@prisma/client` becomes reachable, and every
// in-process vitest worker already has all seven guarded vars set by
// vitest.config.ts's own `env` block before any test file's imports run. That
// snapshot's real behaviour is proven the only way it can be: by spawning the real
// entry point in test/boot/assert-env-not-file-sourced.test.ts.
import { describe, expect, it } from 'vitest'
import { GUARDED_ENV_VAR_NAMES, namesPresentIn } from '../../src/config/env-snapshot.js'

describe('GUARDED_ENV_VAR_NAMES', () => {
  it('is exactly the seven variables #284 measured @prisma/client filling from apps/api/.env', () => {
    expect([...GUARDED_ENV_VAR_NAMES].sort()).toEqual(
      [
        'DATABASE_URL',
        'GUEST_SESSION_SECRET',
        'PRISMA_FIELD_ENCRYPTION_KEY',
        'BETTER_AUTH_SECRET',
        'BETTER_AUTH_URL',
        'CORS_ALLOWED_ORIGINS',
        'PORT',
      ].sort(),
    )
  })
})

describe('namesPresentIn', () => {
  it('returns the empty set for an env with none of the guarded names', () => {
    expect(namesPresentIn({})).toEqual(new Set())
  })

  it('tracks presence, not validity — an empty string still counts as present', () => {
    expect(namesPresentIn({ DATABASE_URL: '' }).has('DATABASE_URL')).toBe(true)
  })

  it('never reports a name that was not passed in', () => {
    const present = namesPresentIn({ DATABASE_URL: 'x' })
    expect(present.has('GUEST_SESSION_SECRET')).toBe(false)
  })

  it('ignores env vars outside the guarded set entirely', () => {
    expect(namesPresentIn({ SOME_OTHER_VAR: 'x' })).toEqual(new Set())
  })

  it('reports every guarded name that is present, all at once', () => {
    const env = Object.fromEntries(GUARDED_ENV_VAR_NAMES.map((name) => [name, 'x']))
    expect(namesPresentIn(env)).toEqual(new Set(GUARDED_ENV_VAR_NAMES))
  })
})
