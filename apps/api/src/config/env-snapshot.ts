// The pre-Prisma environment snapshot (#284). Musti's ruling, after two of his own
// corrections each targeted something upstream of the hazard instead of the hazard
// itself (file-on-disk, then the generated client's baked `schemaEnvPath`): checking
// `schemaEnvPath` cannot tell "correctly generated, genuinely safe" apart from "Prisma
// renamed the field and I am blind" — both read as the key being absent from
// `relativeEnvPaths`, which is itself a normal, correct state (a client generated with
// no schema-adjacent `.env` present bakes the key missing, not present-and-null;
// measured on a clean `pnpm install` in this repo, no `apps/api/.env` on disk:
// `relativeEnvPaths` carries only `rootEnvPath: null`, no `schemaEnvPath` key at all).
//
// So this checks the EFFECT instead of the mechanism: whether a value nobody supplied
// materialised in `process.env` between "before anything could reach `@prisma/client`"
// and "now". That distinguishes "came from the environment" from "came from a file"
// definitionally, and it stays true regardless of how Prisma produces the merge, what
// its internal field is named, or whether that field exists in a future Prisma version.
//
// ORDERING INVARIANT — load-bearing, and NOT enforced by any lint rule today
// (`.oxlintrc.json` has no import-sort rule, so nothing stops a re-sort from breaking
// this): the snapshot below must be captured before ANY import reaches
// `@prisma/client`. `@prisma/client`'s generated client merges the schema-adjacent
// `.env` into `process.env` as an IMPORT SIDE EFFECT (measured, Prisma 6.19.3, #275/
// #284) — once that import has run, "before" is unrecoverable from inside this
// process. `main.ts` imports THIS MODULE FIRST, deliberately ahead of its otherwise
// alphabetical import order (`./app.module.js` would sort first) — see main.ts's own
// comment at that import for why. `test/boot/assert-env-not-file-sourced.test.ts`'s
// control-proof case (ADR-0021) moves this import below `./app.module.js` and asserts
// the guard built on it goes blind as a direct result — that is what makes this
// ordering a checked invariant rather than a comment nobody re-reads.
import process from 'node:process'

/**
 * Every `process.env` name a fail-closed production check in this app depends on —
 * ADR-0007 (`GUEST_SESSION_SECRET`), ADR-0008 (`PRISMA_FIELD_ENCRYPTION_KEY`),
 * ADR-0011 (`CORS_ALLOWED_ORIGINS`), ADR-0012 (`BETTER_AUTH_SECRET`/`BETTER_AUTH_URL`),
 * plus `DATABASE_URL`/`PORT` — exactly the seven variables #284 measured
 * `@prisma/client`'s import silently filling from `apps/api/.env` whenever a name was
 * unset.
 */
export const GUARDED_ENV_VAR_NAMES = [
  'DATABASE_URL',
  'GUEST_SESSION_SECRET',
  'PRISMA_FIELD_ENCRYPTION_KEY',
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_URL',
  'CORS_ALLOWED_ORIGINS',
  'PORT',
] as const

export type GuardedEnvVarName = (typeof GUARDED_ENV_VAR_NAMES)[number]

/** Pure: which of `GUARDED_ENV_VAR_NAMES` are present (set, any value, including
 *  empty string — presence, not validity, is what this module tracks) in `env`.
 *  Exported separately from the module-level snapshot below so both halves — "what
 *  was captured" and "how presence is read off an env object" — are independently
 *  unit-testable without needing to control `process.env` itself (env-snapshot.test.ts). */
export function namesPresentIn(env: NodeJS.ProcessEnv): ReadonlySet<GuardedEnvVarName> {
  return new Set(GUARDED_ENV_VAR_NAMES.filter((name) => env[name] !== undefined))
}

/**
 * Captured the moment this module is first evaluated — see the header comment for why
 * that moment is the one that matters. Reading `process.env` again later would not be
 * "before anything could reach `@prisma/client`", it would be "whenever someone
 * happens to call a function" — exactly the property this snapshot exists to fix, so
 * it is taken once, at module-evaluation time, into a frozen `Set`.
 */
export const PRESENT_BEFORE_PRISMA_COULD_LOAD: ReadonlySet<GuardedEnvVarName> = namesPresentIn(process.env)
