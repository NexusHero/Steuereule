// The real-child-process boot harness, extracted from database-boot-guard.test.ts
// (#284, Musti's ruling: "reusing the runServer() child-process harness ... Do not
// build a second harness; that one has been through two review rounds and its header
// already documents this merge"). Behaviour is UNCHANGED from what it replaces — this
// is a pure extraction so `assert-env-not-file-sourced.test.ts` can spawn the same
// real entry point the same way, not a second, drifting copy of it.
//
// Spawns the REAL production entry point (`tsx <entry>`, the same "run without a
// build step" bridge ADR-0010a's smoke job uses for `dist/main.js`) as its own child
// process, with an explicit, hand-built env — never `...process.env`. That's the
// deliberate break from every other test file in this suite: `vitest.config.ts`
// injects a syntactically-valid `DATABASE_URL` (and friends) into every in-process
// test's env before any test body runs (see its own comment), so no test running
// inside that process could ever observe a broken/unset guarded variable at all — the
// exact condition these guards exist to catch. A real child process is the only way
// to reach it.
//
// `entry` defaults to the real `src/main.ts`, but callers may pass an absolute path to
// a different (test-fixture) entry point — assert-env-not-file-sourced.test.ts uses
// this for its own ordering-broken fixture and for entry points backed by a
// differently-generated Prisma client, both spawned from OUTSIDE `apiRoot`.
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const apiRoot = fileURLToPath(new URL('../../../', import.meta.url))
export const tsxBin = fileURLToPath(new URL('../../../node_modules/.bin/tsx', import.meta.url))

export interface RunResult {
  code: number | null
  output: string
}

// THE INVARIANT (Salih's wording, and it belongs next to the numbers rather than in a
// report): **the failsafe must always be shorter than the test that contains it.**
//
// Why it is load-bearing (Musti's F10, measured independently by both of them):
// `runServer`'s failsafe is the only thing that kills a hung server. Vitest's per-case
// timeout merely fails the case and walks away, leaving `tsx src/main.ts` alive and
// holding its port — which turns the NEXT run red with `EADDRINUSE`, a failure that
// looks like a defect in whatever is being reviewed. Musti lost time to exactly that in
// this session; Salih then counted 20 orphaned servers on his machine from earlier
// sessions, the oldest 1h44m old.
//
// The ordering used to hold by coincidence (15s < 20s) and broke when the failsafe was
// raised to 30s for the cleanup-path case, leaving two of three cases with a failsafe
// that could never be reached. The first repair derived the case timeout FROM the
// failsafe (`CASE_TIMEOUT_MS = FAILSAFE_MS + 10_000`) and put `do not write a literal`
// in a comment next to it — but a note is not a control (F12). Anyone adding a case
// with a hand-written `5_000` got a 30s failsafe inside a 5s case, i.e. exactly the
// unreachable failsafe this constant exists to prevent, with nothing to stop them.
//
// So the derivation runs the other way now: the CASE TIMEOUT is the input, and
// `failsafeFor()` computes a bound strictly below it — for every positive input, not
// just for the one we happen to pass. `runServer(env, caseTimeoutMs)` takes the case's
// own timeout and derives its failsafe from it, so a literal at the call site produces
// a failsafe underneath THAT literal instead of drifting away from it. Structural
// instead of conventional; the same move as denylist → allowlist in `redactCause`.
//
// How far below the case timeout the failsafe sits when there is room for it. 10s
// leaves the cleanup-path case (measured at ~13s to exit) its 30s bound unchanged
// from the version this replaces, so the timing behaviour is not silently retuned.
const FAILSAFE_MARGIN_MS = 10_000

/** Salih's invariant, as a computation rather than a comment: **the failsafe must
 *  always be shorter than the test that contains it.**
 *
 *  Total over every usable case timeout. Where the margin fits, the failsafe is
 *  `caseTimeoutMs - FAILSAFE_MARGIN_MS`; where it does not (a short, hand-written
 *  case timeout), it falls back to half the case timeout, which is still strictly
 *  below it. A non-positive or non-finite input has no failsafe that can satisfy the
 *  invariant, so it is rejected rather than quietly returning a bound that cannot
 *  fire — the failure mode this whole constant exists to make impossible. */
export function failsafeFor(caseTimeoutMs: number): number {
  if (!Number.isFinite(caseTimeoutMs) || caseTimeoutMs <= 0) {
    throw new Error(`case timeout must be a positive, finite number of ms — got ${caseTimeoutMs}`)
  }
  const withMargin = caseTimeoutMs - FAILSAFE_MARGIN_MS
  return withMargin > 0 ? withMargin : Math.floor(caseTimeoutMs / 2)
}

/** Kills the spawned server's whole process GROUP, not just the process we hold a
 *  handle to — and that distinction is the entire point (measured while fixing F10).
 *
 *  `tsxBin` is a CLI wrapper: it spawns the real entry point as a GRANDchild.
 *  `child.kill()` therefore reaps the wrapper and leaves the server running, reparented
 *  to init and still holding its port.
 *
 *  This is a second, independent mechanism behind the same symptom, and it predates the
 *  timing bug rather than following from it. Measured with a deliberately hung guard:
 *  fixing F10's timing alone still left 3 live servers behind at `ppid=1`, and so did
 *  the ORIGINAL 15s harness in which the failsafe reliably won — it fired, it printed
 *  its diagnostic, and it killed the wrong process every time. So the failsafe has never
 *  actually reaped a hung server; the timing fix alone would only have restored the
 *  message. That is the better explanation for orphans surviving across sessions.
 *
 *  `detached: true` above puts the wrapper and the server in their own process group,
 *  and the negative pid signals the whole group. Verified: 0 survivors. */
function killServerTree(child: ChildProcessWithoutNullStreams): void {
  if (child.pid === undefined) return
  killGroup(child.pid)
}

function killGroup(pid: number): void {
  try {
    process.kill(-pid, 'SIGKILL')
  } catch {
    // Already gone, or the group outlived its leader — nothing left to reap.
  }
  liveGroups.delete(pid)
}

/** Every spawned group leader that has not been observed to exit (F11).
 *
 *  `detached: true` closed one door and opened another, and that second door is the
 *  more likely source of the orphans we keep counting. Before it, the wrapper and the
 *  server sat in vitest's own foreground process group, so a terminal Ctrl-C reached
 *  them along with everything else. Now they form their OWN group, which is what lets
 *  the failsafe reap them — and also what makes an INTERRUPTED run leave them standing:
 *  the SIGINT goes to vitest's group and never crosses into theirs.
 *
 *  Measured on this branch, a real aborted run (SIGINT to the runner's process group,
 *  survivors counted over `/proc`, not `ps | grep`): 2 processes alive mid-run → 2
 *  survivors at `ppid=1` without this reaper, still there 40s later. The failsafe
 *  cannot cover this case; it dies with the run that armed it.
 *
 *  What the same measurement also showed, and it qualifies the finding rather than
 *  softening it: abort while a case whose child exits on its own is in flight (the
 *  presence case, ~3s) and the count is back to 0 within seconds — that child was
 *  leaving anyway. The orphan is permanent exactly when the child does NOT exit on its
 *  own, which is the hung-server condition the failsafe exists for and the one that
 *  produces a server still holding its port an hour later. So the numbers above were
 *  taken with a deliberately hung guard, removed again afterwards.
 *
 *  So the groups are tracked here and killed when this process goes away for any
 *  reason it can observe. Not coverable, and deliberately not pretended otherwise: a
 *  SIGKILL of the runner, which no handler can intercept. */
const liveGroups = new Set<number>()

function reapAllGroups(): void {
  // `killGroup` deletes the entry it was handed. Removing the CURRENT element during a
  // Set iteration is well-defined — the iterator visits each remaining entry once — so
  // this needs no defensive copy.
  for (const pid of liveGroups) killGroup(pid)
}

/** The ONE registration point in this test tier for "run this when the process ends,
 *  however it ends" (#284 F1). `exit` covers the ordinary end of the run, including a
 *  failed one. The signal handlers cover the interrupted run: each is `once`, so after
 *  reaping it re-raises the same signal, which then reaches vitest's own handler — or
 *  the default action if it has none. Registering a listener suppresses that default,
 *  so re-raising rather than swallowing is what keeps Ctrl-C still meaning "stop".
 *
 *  `reapAllGroups` below is the original caller; `env-snapshot-client-fixtures.ts`'s own
 *  `.env` restore is the second (Musti's ruling on F1: "reuse that mechanism, do not
 *  build a second one" — a second, independently built exit/signal handler is exactly
 *  the kind of drift that leaves one of the two half-covered).
 *
 *  EACH REGISTERED CLEANUP RUNS IN ITS OWN try/catch (#284 F6, measured with a two-
 *  registrant repro — A throws, B is registered after A): `process.emit` calls every
 *  listener for an event synchronously, in ONE loop, and an exception thrown out of one
 *  listener propagates out of that loop — every OTHER listener for the same event that
 *  was registered AFTER the throwing one simply never runs ("B ran" never printed, on
 *  both the `exit` path and the `SIGINT` path). A previous version of this comment
 *  claimed "multiple registrations compose safely"; that was true only by the accident
 *  that no cleanup registered before another had ever actually thrown — `reapAllGroups`
 *  can't (`killGroup` catches), but `env-snapshot-client-fixtures.ts`'s own restore CAN
 *  (an ENOENT `renameSync` if its backup vanished from under it), and it registers
 *  last, so nothing downstream of it was ever exposed. Registration order is not a
 *  contract; a throw is now caught and reported (`console.error`, never swallowed) so
 *  it cannot starve any other cleanup registered here, in either order.
 *
 *  CONTRACT: every `cleanup` passed here MUST be idempotent. On the signal path the
 *  SAME cleanup runs TWICE by design — once from the `once` signal wrapper below, and
 *  again from the `exit` listener as the process actually terminates once `process.kill`
 *  re-raises the signal (measured: "A ran" printed twice in the same two-registrant
 *  repro). Re-triggering a cleanup that isn't idempotent is a caller bug this function
 *  cannot detect or prevent — see `buildClientFixtures()`'s own `cleaned` flag in
 *  `env-snapshot-client-fixtures.ts` for the shape a caller needs. */
export function registerExitCleanup(cleanup: () => void): void {
  process.on('exit', () => runCleanupSafely(cleanup))
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      runCleanupSafely(cleanup)
      process.kill(process.pid, signal)
    })
  }
}

/** Report, never swallow (#284 F6): a cleanup that throws still gets its error printed,
 *  it just can no longer take any other registered cleanup down with it. */
function runCleanupSafely(cleanup: () => void): void {
  try {
    cleanup()
  } catch (error) {
    console.error(error)
  }
}

registerExitCleanup(reapAllGroups)

/** Boots a real entry point (`src/main.ts` by default) as a real child process under
 *  an explicit (never inherited) env, and waits for it to exit on its own — a guard
 *  that hangs instead of failing fast is exactly as broken as one that doesn't fire
 *  at all.
 *
 *  Takes the CASE's timeout and derives its own failsafe from it (F12), so the bound
 *  is always inside the case that armed it, whatever that case passes.
 *
 *  `cwd` and `entryPath` are independently overridable: assert-env-not-file-sourced's
 *  fixtures live in a copied `src/` tree elsewhere under `apps/api/`, generated once
 *  per client state in `beforeAll` rather than swapping the real, shared
 *  `apps/api/node_modules/@prisma/client` a concurrently-running test file might also
 *  be importing in-process. */
export function runServer(
  env: Record<string, string>,
  caseTimeoutMs: number,
  options?: { cwd?: string; entryPath?: string },
): Promise<RunResult> {
  const failSafeMs = failsafeFor(caseTimeoutMs)
  const cwd = options?.cwd ?? apiRoot
  const entryPath = options?.entryPath ?? 'src/main.ts'
  return new Promise((resolve, reject) => {
    const child: ChildProcessWithoutNullStreams = spawn(tsxBin, [entryPath], {
      cwd,
      // PATH (to find `node`, which tsx's shebang needs) and HOME (Node/tsx's own
      // cache lookups) are the only ambient values carried through; everything the
      // app itself reads is set explicitly below, per test.
      env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ...env },
      // `detached` makes this child a process-group leader so the failsafe can kill the
      // GROUP. See killServerTree — without it the failsafe reaps the wrong process.
      detached: true,
    })

    if (child.pid !== undefined) liveGroups.add(child.pid)

    let output = ''
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })

    const failSafe = setTimeout(() => {
      killServerTree(child)
      reject(new Error(`server did not exit on its own within the test timeout — output so far:\n${output}`))
    }, failSafeMs)

    child.on('error', (error) => {
      clearTimeout(failSafe)
      if (child.pid !== undefined) liveGroups.delete(child.pid)
      reject(error)
    })
    child.on('exit', (code) => {
      clearTimeout(failSafe)
      if (child.pid !== undefined) liveGroups.delete(child.pid)
      resolve({ code, output })
    })
  })
}
