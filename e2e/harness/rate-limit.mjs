// Shared rate-limit pacing helpers — the "never clear a REQ-010 control to make a gate pass"
// discipline every e2e gate that shares CI's `Browser gates` job must follow.
//
// WHY THIS FILE EXISTS (Musti's #300 review, G2). `device-authorization.mjs` and
// `session/return-visit.mjs` had each grown a byte-identical copy of these functions — not a
// style nit: the "read the real bucket state, never truncate it" rule is a control's own policy,
// and two copies of a control are two things that can quietly drift apart, and the one that
// drifts silently is the one that stops controlling anything. This module is the one canonical
// copy; every script that shares the `Browser gates` job imports from here rather than growing a
// second copy.
//
// SUBSTRATE CHANGE (Ticket 13, PR #362 — this header supersedes the old "read the real
// `RateLimit` row" wording). Until Ticket 02, the buckets this file paced lived in the `RateLimit`
// table (`no-trusted-ip|<path>` for better-auth's built-in limiter, `device-code:<ip>` /
// `device-pending:<ip>` for the two hand-rolled device limiters), and `waitForBucketHeadroom`
// read them back via `sql` — the real, cross-process bucket state, including whatever an earlier
// script in the same CI job had spent. Ticket 02 dropped the table: better-auth's limiter now
// lives in the in-memory `createResettableRateLimitStorage()` (`apps/api/src/auth/
// rate-limit-storage.ts`), and the device limiters live in `@nestjs/throttler`'s in-memory
// default storage — neither is readable from a separate e2e process, and no SQL can reach them.
// `readBucketByExactKey`/`readBucketByPrefix` therefore had nothing left to read and are gone.
//
// The discipline survives, only its substrate moved from "read the DB row" to "mirror the
// limiter's own arithmetic in this process, and — where a bucket is shared with other scripts in
// the same job — give it a full window to lapse before spending, because its live state is no
// longer observable". Nothing here clears or loosens a limiter; a 429 is still a hard failure via
// each script's own `guardAgainst429` backstop, and the acceptance tests
// (`apps/api/test/acceptance/req-014-*.test.ts`) still prove the limits actually fire. The
// removed read was a pacing aid, never a gate on its own — this file exists so a well-behaved
// client waits instead of overflowing the bucket and then blaming the app for the 429.

/** Fails loudly, marks the process for a non-zero exit, and throws — the one merge-gate exit
 *  path every e2e script in this repo uses. `message` should already carry its own row/AC/flow
 *  prefix (`fail('Row B: ...')`, `fail('AC-3: ...')`) — this function adds none of its own. */
export function fail(message) {
  console.error(`::error::${message}`)
  process.exitCode = 1
  throw new Error(message)
}

// The client-side mirror of the in-memory buckets this process is pacing. Keyed by `label` (the
// path/bucket name a call site supplies), each entry holds the same two fields the removed
// `RateLimit` row held — `count` and `lastRequest` — advanced by exactly the rolling-window
// arithmetic in `rate-limit-storage.ts`'s `consume`, so a script's own spend is paced against
// the same window/max the limiter enforces. This is per-process state by design (each e2e step is
// its own `node` process); the cross-process half — what a previous script left behind — is
// handled by the `shared` first-use wait in `waitForBucketHeadroom`, not by reading the bucket.
const buckets = new Map()

/**
 * Paces the caller against the in-memory rate-limit bucket named by `label` — mirroring the
 * limiter's own rolling-window arithmetic rather than reading a (now-removed) DB row, and
 * reserving a slot for the call the caller is about to make.
 *
 * `config` is `{ windowMs, max, shared }`:
 *   - `windowMs`/`max` are the limiter's own window and cap (better-auth's built-in rule is
 *     10s/3; the device throttlers are 60s/10).
 *   - `shared: true` marks a bucket that OTHER scripts in the same CI job also spend, whose live
 *     state this process cannot read. On the first paced call to a shared bucket in this process,
 *     we wait out a full window first — the conservative, honest replacement for the removed
 *     cross-process read: "I cannot see what a prior script left behind, so I give the window a
 *     chance to lapse before I spend." Device buckets are NOT marked `shared`: their 60s window
 *     combined with the job's slow, multi-minute scripts means no script ever starts within one
 *     window of the previous script's last mint, so a first-use wait there would be pure waste.
 *
 * The wait is always a wait — never a `DELETE`, never a config tweak. Clearing a REQ-010 control
 * to make a gate pass was tried once elsewhere in this repo and reverted; every caller of this
 * function inherits that discipline by construction.
 *
 * `scriptTag` (e.g. `'device-authorization'`, `'return-visit'`) prefixes the wait log so two
 * self-pacing scripts sharing one CI job stay distinguishable in the log.
 *
 * The rolling-window arithmetic below matches `rate-limit-storage.ts`'s `consume` exactly — the
 * same "reset after a gap longer than the window, otherwise block at max, otherwise increment and
 * slide the window" shape the removed DB-backed limiter used. For the `@nestjs/throttler` device
 * buckets the real storage is a *sliding* window (each hit expires independently after its own
 * `ttl`), not a rolling one; this rolling mirror is the conservative superset — it waits at least
 * as long as the sliding window would require and never less, so it can only over-pace, never
 * under-pace.
 */
export async function waitForBucketHeadroom(config, label, scriptTag) {
  let state = buckets.get(label)

  if (!state) {
    if (config.shared) {
      console.log(
        `[${scriptTag}] ${label} is a shared bucket this process cannot read — waiting ${config.windowMs}ms ` +
          'for any prior script to leave a full quiet window rather than assuming it starts empty.',
      )
      await new Promise((resolvePromise) => setTimeout(resolvePromise, config.windowMs + 250))
    }
    state = { count: 0, lastRequest: Date.now() }
    buckets.set(label, state)
  } else if (Date.now() - state.lastRequest > config.windowMs) {
    // A quiet gap longer than the window resets the rolling count — the `consume` reset branch.
    state = { count: 0, lastRequest: Date.now() }
    buckets.set(label, state)
  }

  if (state.count >= config.max) {
    const waitMs = config.windowMs - (Date.now() - state.lastRequest) + 250
    console.log(`[${scriptTag}] ${label} bucket is at ${state.count}/${config.max} — waiting ${waitMs}ms rather than clearing it.`)
    await new Promise((resolvePromise) => setTimeout(resolvePromise, waitMs))
    state = { count: 0, lastRequest: Date.now() }
    buckets.set(label, state)
  }

  // Reserve the slot for the call the caller is about to make, exactly as `consume` advances the
  // limiter when a request is allowed. Recording here (rather than after the call) keeps every
  // existing call site's "pace right before spending" shape intact.
  state.count += 1
  state.lastRequest = Date.now()
}
