// Pure function-level tests for the decision logic (#284) — synthetic before/after
// states, no real process.env, no spawned process, no Prisma. The one thing this file
// CANNOT prove — that the real module-level snapshot is actually captured before
// `@prisma/client` becomes reachable, and that the ordering this depends on is really
// load-bearing — is proven against the real entry point in
// test/boot/assert-env-not-file-sourced.test.ts (ADR-0021's control-proof case 4).
import { describe, expect, it } from 'vitest'
import { assertEnvNotFileSourced, namesThatArrivedAfterPrismaCouldLoad } from '../../src/config/assert-env-not-file-sourced.js'

describe('namesThatArrivedAfterPrismaCouldLoad', () => {
  it('reports nothing when nothing new appeared', () => {
    const before = new Set(['DATABASE_URL'] as const)
    expect(namesThatArrivedAfterPrismaCouldLoad(before, { DATABASE_URL: 'x' })).toEqual([])
  })

  it('reports a name present after but absent before — the merge signature', () => {
    const before = new Set([] as const)
    expect(namesThatArrivedAfterPrismaCouldLoad(before, { DATABASE_URL: 'x' })).toEqual(['DATABASE_URL'])
  })

  it('does not report a name the operator already supplied, even though its value could not be told apart from a merged one', () => {
    // A guarded var present BOTH before and after is exactly what a correctly
    // configured deployment looks like — this is the F6 clause the ticket's
    // acceptance criterion names explicitly, at the level this function actually
    // decides it: presence-before, not value comparison (Prisma's merge is measured
    // fill-only, so "present before" already rules out the value having changed).
    const before = new Set(['GUEST_SESSION_SECRET'] as const)
    expect(namesThatArrivedAfterPrismaCouldLoad(before, { GUEST_SESSION_SECRET: 'operator-set' })).toEqual([])
  })

  it('reports every guarded name that arrived, in GUARDED_ENV_VAR_NAMES order, not the order they were checked', () => {
    const before = new Set(['PORT'] as const)
    const after = {
      DATABASE_URL: 'x',
      GUEST_SESSION_SECRET: 'x',
      PRISMA_FIELD_ENCRYPTION_KEY: 'x',
      BETTER_AUTH_SECRET: 'x',
      BETTER_AUTH_URL: 'x',
      CORS_ALLOWED_ORIGINS: 'x',
      PORT: 'x',
    }
    expect(namesThatArrivedAfterPrismaCouldLoad(before, after)).toEqual([
      'DATABASE_URL',
      'GUEST_SESSION_SECRET',
      'PRISMA_FIELD_ENCRYPTION_KEY',
      'BETTER_AUTH_SECRET',
      'BETTER_AUTH_URL',
      'CORS_ALLOWED_ORIGINS',
    ])
  })

  it('ignores a name that disappeared (present before, absent after) — not this control’s concern', () => {
    const before = new Set(['DATABASE_URL'] as const)
    expect(namesThatArrivedAfterPrismaCouldLoad(before, {})).toEqual([])
  })
})

describe('assertEnvNotFileSourced', () => {
  it('does nothing outside production, even when something arrived — the merge is what lets the guard and the app share one string (#275 F7); refusing here would break `cp .env.example .env`', () => {
    const before = new Set([] as const)
    expect(() =>
      assertEnvNotFileSourced({ DATABASE_URL: 'x', NODE_ENV: 'development' }, before),
    ).not.toThrow()
    expect(() => assertEnvNotFileSourced({ DATABASE_URL: 'x', NODE_ENV: 'test' }, before)).not.toThrow()
    expect(() => assertEnvNotFileSourced({ DATABASE_URL: 'x' }, before)).not.toThrow()
  })

  it('does nothing in production when nothing arrived — the F6 clause: a fully-configured deployment must never trip this, file present or not', () => {
    const before = new Set(['DATABASE_URL', 'GUEST_SESSION_SECRET'] as const)
    expect(() =>
      assertEnvNotFileSourced({ DATABASE_URL: 'x', GUEST_SESSION_SECRET: 'y', NODE_ENV: 'production' }, before),
    ).not.toThrow()
  })

  it('refuses in production when something arrived, naming the variable', () => {
    const before = new Set([] as const)
    expect(() => assertEnvNotFileSourced({ DATABASE_URL: 'x', NODE_ENV: 'production' }, before)).toThrow(
      /Refusing to start.*DATABASE_URL/s,
    )
  })

  it('names every variable that arrived, not just the first', () => {
    const before = new Set([] as const)
    try {
      assertEnvNotFileSourced(
        { DATABASE_URL: 'x', GUEST_SESSION_SECRET: 'y', PORT: 'z', NODE_ENV: 'production' },
        before,
      )
      expect.unreachable('expected assertEnvNotFileSourced to throw')
    } catch (error) {
      const message = (error as Error).message
      expect(message).toContain('DATABASE_URL')
      expect(message).toContain('GUEST_SESSION_SECRET')
      expect(message).toContain('PORT')
    }
  })

  it('never puts a guarded variable’s VALUE in the message — names only, same rule as describeDatabaseTarget', () => {
    const before = new Set([] as const)
    try {
      assertEnvNotFileSourced(
        {
          DATABASE_URL: 'postgresql://someuser:super-secret-pw@127.0.0.1:5432/db',
          GUEST_SESSION_SECRET: 'a-real-looking-secret-value',
          NODE_ENV: 'production',
        },
        before,
      )
      expect.unreachable('expected assertEnvNotFileSourced to throw')
    } catch (error) {
      const message = (error as Error).message
      expect(message).not.toContain('super-secret-pw')
      expect(message).not.toContain('someuser')
      expect(message).not.toContain('a-real-looking-secret-value')
    }
  })

  it('names apps/api/.env as the likely source, computed structurally rather than read off any Prisma internal', () => {
    const before = new Set([] as const)
    expect(() => assertEnvNotFileSourced({ DATABASE_URL: 'x', NODE_ENV: 'production' }, before)).toThrow(
      /apps[\\/]api[\\/]\.env/,
    )
  })
})
