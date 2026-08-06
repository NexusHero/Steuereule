// The boot-time refusal built on env-snapshot.ts's pre-Prisma capture (#284). Lives
// next to assert-database-reachable.ts and is called BEFORE it from main.ts's
// bootstrap() (Musti's ruling) — this check is cheap and synchronous, no I/O, the same
// "fail fast on the cheap check first" ordering resolveDatabaseUrl's presence check
// already uses ahead of assertDatabaseReachable's real connection probe. It must also
// run first for a second reason specific to this bug: if it ran after
// assertDatabaseReachable(), a DATABASE_URL that leaked in from an import-time merge
// would already have been dialled (successfully or not) before this ever got to name
// the leak — the wrong finding would report first.
//
// WHY this checks the EFFECT (arrival in process.env) rather than `schemaEnvPath` or
// any other @prisma/client internal — see env-snapshot.ts's header comment, the
// canonical home for that reasoning (#284 F5: keep it in one place, not three, so the
// next correction lands where it can actually be found).
import { fileURLToPath } from 'node:url'
import { GUARDED_ENV_VAR_NAMES, type GuardedEnvVarName, namesPresentIn, PRESENT_BEFORE_PRISMA_COULD_LOAD } from './env-snapshot.js'

/**
 * The one file in this repository whose import-time side effects are known to
 * populate `process.env` behind this guard's back: `@prisma/client`'s generated
 * loader merges the schema-adjacent `.env` at import — always `apps/api/.env`,
 * computed structurally from this module's own location rather than read off
 * Prisma's generated config (see env-snapshot.ts's header comment for why). Named in
 * the refusal purely as an operator hint for where to look; it plays no part in the
 * check itself, unlike the two proxies this control replaces.
 */
const LIKELY_SOURCE_ENV_FILE = fileURLToPath(new URL('../../.env', import.meta.url))

/** Pure: which guarded names are present in `after` but were absent from `before` —
 *  the signature of a value that arrived from somewhere other than the operator
 *  supplying it up front. Exported so the decision logic is unit-testable with
 *  synthetic before/after states, without spawning a process or touching the real
 *  module-level snapshot (assert-env-not-file-sourced.test.ts). */
export function namesThatArrivedAfterPrismaCouldLoad(
  before: ReadonlySet<GuardedEnvVarName>,
  after: NodeJS.ProcessEnv,
): GuardedEnvVarName[] {
  return GUARDED_ENV_VAR_NAMES.filter((name) => !before.has(name) && namesPresentIn(after).has(name))
}

/**
 * Refuses to start, under `NODE_ENV=production` only, if any guarded variable that
 * was absent from `before` (the real pre-Prisma snapshot by default) is present in
 * `env` now — the signature of an import-time file merge nobody asked for (#284).
 *
 * Outside production this is always a no-op by design, even when names did arrive:
 * the same merge is what lets a guard and the app it protects read one identical
 * string for `DATABASE_URL` (#275 F7), and refusing it in dev/test would break the
 * documented `cp .env.example .env` local setup for zero correctness gain — the exact
 * F6 shape Musti corrected himself out of while designing this control (see #284).
 *
 * A correctly configured deployment must see this be a no-op regardless of whether a
 * stray `.env` exists on disk — nothing NEW can appear in `env` for a name the
 * operator already supplied, so `before` already contains it and the filter above
 * never selects it. That's the F6 clause this function exists to satisfy, not just
 * document: see the boot test's cases 2/3 for the proof.
 *
 * KNOWN GAP (#284 F3, no behaviour change intended): the `env.NODE_ENV !== 'production'`
 * gate right below reads `NODE_ENV` from the SAME live environment the merge already
 * wrote into, so a stray schema-adjacent `.env` that also happens to carry
 * `NODE_ENV=development` — or an operator who simply forgot to set it — switches this
 * guard off in the same breath it exists to catch. That is a limit shared with every
 * sibling resolver gating on the same live value (`resolveFieldEncryptionKey`,
 * `resolveGuestSessionSecret`, `resolveBetterAuthUrl`), a pre-existing production gate
 * out of scope for this ticket's acceptance criterion. Reading the pre-Prisma
 * snapshot's own `NODE_ENV` instead is deliberately NOT done here: it would break
 * today's working `.env`-supplied-`NODE_ENV` deployments for no correctness gain this
 * criterion asks for.
 */
export function assertEnvNotFileSourced(
  env: NodeJS.ProcessEnv = process.env,
  before: ReadonlySet<GuardedEnvVarName> = PRESENT_BEFORE_PRISMA_COULD_LOAD,
): void {
  const arrived = namesThatArrivedAfterPrismaCouldLoad(before, env)
  if (arrived.length === 0) return
  if (env.NODE_ENV !== 'production') return

  throw new Error(
    `Refusing to start: ${arrived.join(', ')} ${arrived.length === 1 ? 'is' : 'are'} present in this ` +
      "process's environment now but were NOT set when it started — the signature of a value that " +
      `arrived from a file during startup, most likely ${LIKELY_SOURCE_ENV_FILE} if it exists on this ` +
      "machine (Prisma's generated client merges a schema-adjacent .env into process.env as an import " +
      'side effect; see #284). In production every value must come from the operator’s own ' +
      'configuration, never from a file that happened to be on disk at import time — set these ' +
      'explicitly in the environment, or remove the file.',
  )
}
