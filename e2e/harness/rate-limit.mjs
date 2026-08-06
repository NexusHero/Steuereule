// Shared rate-limit-bucket helpers — the "read the real `RateLimit` row, never truncate it"
// discipline every e2e gate that shares CI's `Browser gates` job must follow.
//
// WHY THIS FILE EXISTS (Musti's #300 review, G2). `device-authorization.mjs` and
// `session/return-visit.mjs` had each grown a byte-identical copy of the five functions below
// (`fail`, `readBucketByExactKey`, `readBucketByPrefix`, the internal `parseBucketRow`,
// `waitForBucketHeadroom`) — not a style nit. These functions encode a REQ-010 control's own
// policy: the bucket-key shapes (`no-trusted-ip|<path>` vs. a per-request-IP-prefixed
// `device-code:*`/`device-pending:*`), and above all the "read, never truncate" rule
// `e2e/harness/README.md`'s own "The `RateLimit` table is never truncated to make a gate pass"
// section already documents. Two copies of a control are two things that can quietly drift apart,
// and the one that drifts silently is the one that stops controlling anything. This module is the
// one canonical copy; `device-authorization.mjs` and `session/return-visit.mjs` both import from
// here as of the same change that added this file — a brand-new script growing a second copy
// instead of importing the first was never what the README's "existing scripts not migrated"
// note licensed (that note is about not retrofitting already-committed scripts reflexively, not
// about a new file being free to duplicate).
//
// `sql` is always passed in by the caller (this module owns no connection of its own — every
// existing gate already has one, `stack.mjs`'s own `makeSql` or a script-local equivalent), so it
// composes with either without this module needing to know which.

/** Fails loudly, marks the process for a non-zero exit, and throws — the one merge-gate exit
 *  path every e2e script in this repo uses. `message` should already carry its own row/AC/flow
 *  prefix (`fail('Row B: ...')`, `fail('AC-3: ...')`) — this function adds none of its own. */
export function fail(message) {
  console.error(`::error::${message}`)
  process.exitCode = 1
  throw new Error(message)
}

function parseBucketRow(row) {
  if (!row) return null
  const [countStr, lastRequestStr] = row.split('|')
  const count = Number(countStr)
  const lastRequest = Number(lastRequestStr)
  if (!Number.isFinite(count) || !Number.isFinite(lastRequest)) return null
  return { count, lastRequest }
}

/** Exact-key bucket (better-auth's own built-in rule — the key is known ahead of time, it does
 *  not depend on a per-caller IP this environment can't resolve). */
export function readBucketByExactKey(sql, key) {
  const row = sql(`SELECT count, "lastRequest" FROM "RateLimit" WHERE key = '${key}'`)
  return parseBucketRow(row)
}

/** Prefix-scanned bucket (the device endpoints' keys embed Fastify's own `request.ip`, which a
 *  script cannot predict ahead of time — reads whichever key this job's shared, unresolvable-IP
 *  address actually produced, most-recently-touched first). */
export function readBucketByPrefix(sql, prefix) {
  const row = sql(`SELECT count, "lastRequest" FROM "RateLimit" WHERE key LIKE '${prefix}:%' ORDER BY "lastRequest" DESC LIMIT 1`)
  return parseBucketRow(row)
}

/**
 * Waits out the remainder of a rolling rate-limit window if `bucket` is already at `config.max`
 * — READS the real `RateLimit` row (via `readBucketByExactKey`/`readBucketByPrefix` above),
 * never deletes it. Clearing a REQ-010 control to make a gate pass was tried once elsewhere in
 * this repo and reverted (see this file's own header); every caller of this function inherits
 * that discipline by construction now, not by remembering to copy the comment along with the
 * code. `scriptTag` (e.g. `'device-authorization'`, `'return-visit'`) prefixes the wait log so
 * two self-pacing scripts sharing one CI job stay distinguishable in the log, without either
 * carrying its own copy of this function to get its own prefix.
 */
export async function waitForBucketHeadroom(bucket, config, label, scriptTag) {
  if (!bucket) return
  const elapsed = Date.now() - bucket.lastRequest
  if (bucket.count >= config.max && elapsed < config.windowMs) {
    const waitMs = config.windowMs - elapsed + 250
    console.log(`[${scriptTag}] ${label} bucket is at ${bucket.count}/${config.max} — waiting ${waitMs}ms rather than clearing it.`)
    await new Promise((resolvePromise) => setTimeout(resolvePromise, waitMs))
  }
}
