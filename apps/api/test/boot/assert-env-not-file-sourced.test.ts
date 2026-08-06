// #284 — Musti's ruling, acceptance table verbatim (comment `5208627499`):
//
// | # | Client generated              | Env supplied      | .env present | Expected                                  |
// |---|--------------------------------|--------------------|--------------|--------------------------------------------|
// | 1 | WITH a schema-adjacent .env    | guarded vars unset | yes          | refuses, names the vars and the file       |
// | 2 | WITH a schema-adjacent .env    | all supplied       | yes          | starts — F6, no wrongful rejection         |
// | 3 | WITHOUT one                    | all supplied       | yes          | starts — measured row 2, must stay passing |
// | 4 | control proof                  | —                  | —            | move the snapshot import below             |
// |   |                                |                    |              | ./app.module.js → case 1 goes red          |
//
// "Starts" here means the same thing it means throughout this test tier (no live
// Postgres — that positive path is CI's `smoke` job, see database-boot-guard.test.ts's
// own header comment): OUR guard does not refuse. Every case below supplies a
// DATABASE_URL nothing is listening on, so a case that gets past this guard predictably
// fails a few hundred ms later at `assertDatabaseReachable()`'s own, DIFFERENT,
// already-proven-separately reachability finding — proof this control let it through,
// not proof the server fully came up.
//
// Reuses `runServer()`/`failsafeFor()` from ./support/run-server.ts (Musti: "Do not
// build a second harness") and the client-generation fixture from
// ./support/env-snapshot-client-fixtures.ts (built once in `beforeAll`, per his
// "generate once per state in setup, not per test").
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildClientFixtures, type ClientFixtures } from './support/env-snapshot-client-fixtures.js'
import { failsafeFor, runServer } from './support/run-server.js'

const CASE_TIMEOUT_MS = 30_000
const SETUP_TIMEOUT_MS = 60_000

// Explicit, distinct-from-the-fixture's-own values — proves case 2/3 aren't merely
// re-confirming the fixture's synthetic .env, but a genuinely operator-supplied
// configuration. DATABASE_URL points at a port nothing listens on (same shape
// database-boot-guard.test.ts already uses), so the NEXT guard fails fast.
const ALL_GUARDED_VARS_EXPLICITLY_SUPPLIED = {
  DATABASE_URL: 'postgresql://explicit-operator:explicit-operator@127.0.0.1:1/explicit-operator',
  GUEST_SESSION_SECRET: 'explicit-operator-guest-session-secret',
  PRISMA_FIELD_ENCRYPTION_KEY: 'k1.aesgcm256.MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
  BETTER_AUTH_SECRET: 'explicit-operator-better-auth-secret',
  BETTER_AUTH_URL: 'http://127.0.0.1:1',
  CORS_ALLOWED_ORIGINS: 'http://127.0.0.1:1',
  PORT: '1',
}

const REFUSAL_PATTERN = /Refusing to start/

describe('assertEnvNotFileSourced — the real entry point, both generated-client states', () => {
  let fixtures: ClientFixtures

  beforeAll(() => {
    fixtures = buildClientFixtures()
  }, SETUP_TIMEOUT_MS)

  afterAll(() => {
    fixtures?.cleanup()
  })

  it(
    'row 1 — WITH-env client, guarded vars unset, .env present → refuses, names the vars and the file',
    async () => {
      const { code, output } = await runServer(
        { NODE_ENV: 'production', TSX_TSCONFIG_PATH: fixtures.withEnvTsconfigPath },
        CASE_TIMEOUT_MS,
        { entryPath: fixtures.withEnvEntryPath },
      )

      expect(code).not.toBe(0)
      expect(output).toMatch(REFUSAL_PATTERN)
      // Every one of the seven — this is the leak's whole blast radius, not just the
      // one variable a DATABASE_URL-only check would have caught.
      for (const name of [
        'DATABASE_URL',
        'GUEST_SESSION_SECRET',
        'PRISMA_FIELD_ENCRYPTION_KEY',
        'BETTER_AUTH_SECRET',
        'BETTER_AUTH_URL',
        'CORS_ALLOWED_ORIGINS',
        'PORT',
      ]) {
        expect(output).toContain(name)
      }
      // Names, never values (same rule as describeDatabaseTarget) — the fixture's own
      // synthetic secrets must not appear even though they are what actually leaked.
      expect(output).not.toContain('robin-284-fixture-guest-session-secret')
      expect(output).not.toContain('robin-284-fixture-better-auth-secret')
      expect(output).not.toContain('robin-284-fixture:robin-284-fixture')
      // Names A .env path as the likely source (the operator hint, not part of the
      // check itself). This fixture's own copy of assert-env-not-file-sourced.ts
      // computes it structurally from ITS OWN location — inside the copied tree,
      // not apps/api/src — so it correctly names <fixture>/.env rather than the
      // literal apps/api/.env; that exact, non-fixture-nested resolution is proven
      // separately in test/config/assert-env-not-file-sourced.test.ts.
      expect(output).toMatch(/\.env\b/)
    },
    CASE_TIMEOUT_MS,
  )

  it(
    'row 2 — WITH-env client, every guarded var explicitly supplied, .env present → starts (F6: no wrongful rejection)',
    async () => {
      const { output } = await runServer(
        {
          NODE_ENV: 'production',
          TSX_TSCONFIG_PATH: fixtures.withEnvTsconfigPath,
          ...ALL_GUARDED_VARS_EXPLICITLY_SUPPLIED,
        },
        CASE_TIMEOUT_MS,
        { entryPath: fixtures.withEnvEntryPath },
      )

      // Our guard must not be what stopped this — it must get all the way to the
      // NEXT, separate, already-proven guard (assertDatabaseReachable), refusing on
      // ITS finding instead.
      expect(output).not.toMatch(REFUSAL_PATTERN)
      expect(output).toMatch(/Cannot reach the database at 127\.0\.0\.1:1/)
    },
    CASE_TIMEOUT_MS,
  )

  it(
    'row 3 — WITHOUT-env client, every guarded var explicitly supplied, .env present → starts (measured row 2 of the truth table, must stay passing)',
    async () => {
      const { output } = await runServer(
        {
          NODE_ENV: 'production',
          TSX_TSCONFIG_PATH: fixtures.withoutEnvTsconfigPath,
          ...ALL_GUARDED_VARS_EXPLICITLY_SUPPLIED,
        },
        CASE_TIMEOUT_MS,
        { entryPath: fixtures.withoutEnvEntryPath },
      )

      expect(output).not.toMatch(REFUSAL_PATTERN)
      expect(output).toMatch(/Cannot reach the database at 127\.0\.0\.1:1/)
    },
    CASE_TIMEOUT_MS,
  )

  // ADR-0021's control proof: row 1's own assertion ("refuses, names the vars"),
  // reapplied to a fixture whose ONLY difference is the env-snapshot import sitting
  // after ./app.module.js's — must now FAIL. That is what makes the ordering
  // invariant in main.ts (and its comment) a checked property instead of prose nobody
  // re-reads. `buildClientFixtures()` builds this fixture by deriving it from the
  // real, copied main.ts (never a hand-maintained second copy that could drift) and
  // asserts the reorder actually landed before handing back the path — Musti's
  // amendment to ADR-0021: confirm the break took before trusting the run it produces.
  it(
    'row 4 — control proof: moving the env-snapshot import below ./app.module.js makes the guard go blind (case 1 goes red)',
    async () => {
      const { output } = await runServer(
        { NODE_ENV: 'production', TSX_TSCONFIG_PATH: fixtures.withEnvTsconfigPath },
        CASE_TIMEOUT_MS,
        { entryPath: fixtures.withEnvBrokenOrderingEntryPath },
      )

      // The exact assertion row 1 makes — REFUSAL_PATTERN.toMatch — must NOT hold
      // here: the snapshot was captured AFTER the merge had already happened, so
      // every guarded var looks like it was "always" present and nothing appears to
      // have arrived. The process instead proceeds to the reachability guard, same as
      // rows 2/3 — silently running with values nobody set, which is the exact
      // vulnerability #284 is about.
      expect(output).not.toMatch(REFUSAL_PATTERN)
      expect(output).toMatch(/Cannot reach the database at 127\.0\.0\.1:1/)
    },
    CASE_TIMEOUT_MS,
  )
})

// failsafeFor is exercised end-to-end already by database-boot-guard.test.ts's own
// self-tests; re-asserting the derivation here would test the same pure function a
// second time for no new information. What's worth confirming locally is only that
// this file's own CASE_TIMEOUT_MS still derives a sane, strictly-smaller failsafe.
describe('this file’s own case timeout', () => {
  it('derives a failsafe strictly below CASE_TIMEOUT_MS', () => {
    expect(failsafeFor(CASE_TIMEOUT_MS)).toBeLessThan(CASE_TIMEOUT_MS)
  })
})
