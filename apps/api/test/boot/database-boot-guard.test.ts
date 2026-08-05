// The negative cases ADR-0021 asks for before any "the guard holds" claim: this
// spawns the REAL production entry point (`tsx src/main.ts`, the same "run without a
// build step" bridge ADR-0010a's smoke job uses for `dist/main.js`) as its own child
// process, with an explicit, hand-built env — never `...process.env`. That's the
// deliberate break from every other test file in this suite: `vitest.config.ts`
// injects a syntactically-valid `DATABASE_URL` into every in-process test's env before
// any test body runs (see its own comment), so no test running inside that process
// could ever observe a broken `DATABASE_URL` at all — the exact condition this guard
// exists to catch. A real child process is the only way to reach it.
//
// What that child's env is NOT is ours top to bottom (Musti's review, F7 — this comment
// used to claim exactly that, and it was measurably false). `assert-database-reachable.ts`
// imports `@prisma/client` at module top level, and the generated client merges
// `apps/api/.env` into `process.env` at import time, before `bootstrap()` reads anything.
// So on any machine that followed our documented local setup (`cp .env.example .env`) the
// child inherits a whole `.env` we never handed it. What we DO control is precedence:
// that merge only fills what is UNSET and never overrides — measured, an explicitly passed
// value survives byte-for-byte, empty string included. Both cases below rest on that, and
// neither depends on `.env` happening to be absent.
//
// The positive case (a real, reachable Postgres) is already covered by CI's `smoke`
// job (ci.yml, boots `dist/main.js` against a live service-container Postgres) — no new
// CI surface needed for it. What's missing, and what the first two cases prove, is that
// the process refuses to even get that far under the two broken conditions a
// stakeholder's own docker setup can produce: the variable never set, and the variable
// set but wrong.
//
// The third case (the cleanup path) is CONFIRMATION, not proof, and the distinction
// should not get lost later (Musti's review). Whether `$disconnect()` actually rejects
// is environment-dependent: on a machine where it disconnects cleanly this case passes
// WITHOUT ever exercising the cleanup path at all, and it is written to pass in that
// situation on purpose rather than go red for the wrong reason. The proof is
// `test/config/disconnect-quietly.test.ts`, whose stub always rejects — deterministic,
// every run, everywhere. This case's job is to show the property surviving in the real
// composed process, in the shape Salih actually hit.
//
// `runServer()` below captures BOTH stdout and stderr of the real child process into
// one `output` string, and the credential assertions in the second case run against
// that — not against a parsed `.message` field. That distinction is the point: a
// container's log is the process's combined stdout/stderr, exactly what an operator
// would see, not a structured field only a test can reach into. This one exercises the
// connection-refused failure class, which is measured to never put a credential
// anywhere in that output even unredacted; `redact-cause.test.ts` proves the
// *auth-failure* class — where Prisma's own message does name the configured username —
// is still cut before it can reach here.
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import net from 'node:net'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const apiRoot = fileURLToPath(new URL('../../', import.meta.url))
const tsxBin = fileURLToPath(new URL('../../node_modules/.bin/tsx', import.meta.url))

interface RunResult {
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
const CASE_TIMEOUT_MS = 40_000

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
 *  `tsxBin` is a CLI wrapper: it spawns the real `src/main.ts` server as a GRANDchild.
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

// `exit` covers the ordinary end of the run, including a failed one. The signal
// handlers cover the interrupted run: they are `once`, so after reaping they re-raise
// the same signal, which then reaches vitest's own handler — or the default action if
// it has none. Registering a listener suppresses that default, so re-raising rather
// than swallowing is what keeps Ctrl-C still meaning "stop".
process.on('exit', reapAllGroups)
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    reapAllGroups()
    process.kill(process.pid, signal)
  })
}

/** Boots `src/main.ts` as a real child process under an explicit (never inherited)
 *  env, and waits for it to exit on its own — a guard that hangs instead of failing
 *  fast is exactly as broken as one that doesn't fire at all.
 *
 *  Takes the CASE's timeout and derives its own failsafe from it (F12), so the bound
 *  is always inside the case that armed it, whatever that case passes. */
function runServer(env: Record<string, string>, caseTimeoutMs: number): Promise<RunResult> {
  const failSafeMs = failsafeFor(caseTimeoutMs)
  return new Promise((resolve, reject) => {
    const child: ChildProcessWithoutNullStreams = spawn(tsxBin, ['src/main.ts'], {
      cwd: apiRoot,
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

    // 30s, not 15s: the presence and connection-refused cases exit in ~3s, but the
    // cleanup-path case below deliberately drives Prisma into its own connection-pool
    // timeout, measured at ~13s to exit — a 15s bound would flake on a slower runner.
    // That 30s is now a CONSEQUENCE of the 40s case timeout rather than a number that
    // has to be kept in step with it by hand; see `failsafeFor` above.
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

describe('the real server refuses to start against a broken database configuration', () => {
  // EMPTY, not absent — and the name says so, because they are different inputs
  // (Musti's review, F7). A genuinely-unset `DATABASE_URL` is not establishable from
  // out here: `@prisma/client`'s import fills it in from `apps/api/.env` before
  // `bootstrap()` reads it, and Prisma exposes no flag to skip that load. Passing `{}`
  // — what this case used to do — therefore proved nothing on a machine with a `.env`:
  // measured at this head with the documented local setup in place, the server booted
  // clean and served `GET /v1/profile` → 200 while this assertion went red. It was
  // green in CI only because CI has no `.env` on disk.
  //
  // An explicit `''` is the one broken input the merge cannot overwrite (measured:
  // dotenv treats a set-but-empty key as present and leaves it alone), it reaches the
  // same `!raw || raw.trim().length === 0` branch, and it produces the same presence
  // finding — so the process-level evidence for the presence path is intact; it is now
  // proven with an input this test can actually establish, on any machine, `.env` or
  // not. Genuinely-undefined is covered where it IS reachable — at the function level,
  // in `test/config/database-url.test.ts` (`resolveDatabaseUrl({})`), which imports no
  // Prisma and so triggers no `.env` merge.
  it(
    'DATABASE_URL set but empty → exits non-zero with the presence finding, not a silent boot',
    async () => {
      const { code, output } = await runServer({ DATABASE_URL: '' }, CASE_TIMEOUT_MS)

      expect(code).not.toBe(0)
      expect(output).toMatch(/DATABASE_URL must be set/)
    },
    CASE_TIMEOUT_MS,
  )

  it(
    'DATABASE_URL set but unreachable (wrong host/port — the stakeholder’s own failure mode) → exits non-zero with the reachability finding, host:port only, never the DSN',
    async () => {
      const { code, output } = await runServer(
        {
          // Port 1 on loopback: nothing listens there, so this refuses the connection
          // immediately rather than waiting out the probe's own timeout — keeps the
          // test fast without weakening what it proves.
          DATABASE_URL: 'postgresql://someuser:super-secret-pw@127.0.0.1:1/steuereule',
        },
        CASE_TIMEOUT_MS,
      )

      expect(code).not.toBe(0)
      expect(output).toMatch(/Cannot reach the database at 127\.0\.0\.1:1/)
      expect(output).not.toContain('super-secret-pw')
      expect(output).not.toContain('someuser')
      // The presence finding must NOT also fire here — these are two distinct
      // findings and this run's actual defect is reachability, not presence.
      expect(output).not.toMatch(/DATABASE_URL must be set/)
    },
    CASE_TIMEOUT_MS,
  )

  // Salih's #275 test report, FAIL. The redaction and the finding both live in the
  // guard's `catch`; its `finally { await prisma.$disconnect() }` runs regardless, and
  // an abrupt completion in a `finally` REPLACES whatever try/catch was completing
  // with. So a rejecting disconnect discarded the redacted finding entirely and put
  // Prisma's own raw error — message and stack — on stderr instead. Measured on this
  // branch before the fix, two independent ways: a blackholed host (`10.255.255.1`),
  // and the shape below. He also measured a form where the configured USERNAME reached
  // stderr that way, which is the leak this PR's whole first finding exists to close,
  // arriving through the cleanup path instead of through `cause`.
  //
  // A local TCP server that accepts and then never speaks Postgres makes it
  // deterministic and needs no external network: with `?connect_timeout=30` the driver
  // stays inside its own connect window long past the 5s probe timeout, so the probe
  // throws and the disconnect on that half-open connection is what rejects.
  //
  // Salih's diagnosis of why this hid for five rounds, which is the part worth keeping:
  // the trigger was never "unreachable host". `10.255.255.1` is a blackhole — packets
  // are dropped with no RST — while `192.0.2.1` draws an ICMP unreachable and fails fast
  // enough that the disconnect succeeds and nothing is wrong. The actual condition is
  // **the probe expiring while the driver's connect is still in flight**, so fifteen of
  // his sixteen canary shapes missed it for the same reason: they are built to fail
  // FAST. A suite optimised for fast failure structurally cannot see a defect that only
  // appears on slow failure — which is why this case buys its ~13s.
  //
  // What this asserts is the INVARIANT, not the mechanism — the finding survives
  // cleanup and nothing leaks. If some environment resolves the disconnect cleanly,
  // this still passes rather than failing for the wrong reason; it can only go red if
  // the cleanup path is once again allowed to replace or leak.
  it(
    'a rejecting $disconnect in the guard’s cleanup path cannot replace the redacted finding or leak the DSN',
    async () => {
      // Sockets are tracked so cleanup can destroy them explicitly: `close()` only
      // stops accepting and then waits for existing connections, and the stalled one
      // outlives the child, so without this the test hangs on its own teardown.
      const sockets = new Set<net.Socket>()
      const stall = net.createServer((socket) => {
        sockets.add(socket)
        socket.on('error', () => {})
      })
      await new Promise<void>((resolve) => stall.listen(0, '127.0.0.1', resolve))
      const address = stall.address()
      if (address === null || typeof address === 'string') throw new Error('expected a TCP address')

      try {
        const { code, output } = await runServer(
          {
            DATABASE_URL: `postgresql://someuser:super-secret-pw@127.0.0.1:${address.port}/steuereule?connect_timeout=30`,
          },
          CASE_TIMEOUT_MS,
        )

        expect(code).not.toBe(0)
        // The guard's own finding must still be what the operator sees...
        expect(output).toMatch(/Cannot reach the database at 127\.0\.0\.1:/)
        // ...and the cleanup path must not have become a second way out for the
        // credentials the `catch` path is careful to redact.
        expect(output).not.toContain('someuser')
        expect(output).not.toContain('super-secret-pw')
      } finally {
        for (const socket of sockets) socket.destroy()
        await new Promise<void>((resolve) => stall.close(() => resolve()))
      }
    },
    CASE_TIMEOUT_MS,
  )
})

// The invariant above is load-bearing enough to be checked rather than trusted (F12).
// The version this replaces stated it in a comment — `do not write a literal` — next to
// a constant that a literal at any call site walked straight past. These cases are that
// comment as a computation: they construct the misuse the note asked people not to
// commit, and measure that the ordering survives it anyway.
describe('the failsafe is always shorter than the case that contains it', () => {
  // The case timeouts anyone plausibly writes, including the deliberately hostile ones:
  // shorter than the margin, equal to it, and 1ms.
  const caseTimeouts = [1, 2, 100, 5_000, 9_999, 10_000, 10_001, 20_000, CASE_TIMEOUT_MS, 120_000]

  // Just above the margin, so the derived failsafe is 500ms — see the last case.
  const HAND_WRITTEN_CASE_TIMEOUT_MS = 10_500

  it.each(caseTimeouts)('a case timeout of %ims derives a strictly shorter failsafe', (caseTimeoutMs) => {
    expect(failsafeFor(caseTimeoutMs)).toBeLessThan(caseTimeoutMs)
  })

  it('the case timeouts this file actually passes get the failsafe the cases were measured against', () => {
    // 30s is what the cleanup-path case (~13s to exit) was tuned for. Asserted here so
    // that inverting the derivation cannot silently retune the timing it inherited.
    expect(failsafeFor(CASE_TIMEOUT_MS)).toBe(30_000)
  })

  it('rejects a case timeout no failsafe could fit inside, instead of returning one that cannot fire', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => failsafeFor(bad)).toThrow(/positive, finite/)
    }
  })

  // The cases above prove the DERIVATION is total. They cannot see whether `runServer`
  // actually uses it — and "the harness stopped calling it" is the existence branch of
  // exactly this control (ADR-0021's amendment: a check that only corrupts a value is
  // vacuously satisfied by the value being gone). This one spawns the real child and
  // measures the failsafe firing inside the case that passed its own timeout in.
  it(
    'a hand-written case timeout gets a failsafe that really fires inside it',
    async () => {
      // A literal, deliberately: this is the misuse the old `do not write a literal`
      // comment could only ask people not to commit. It now derives a 500ms failsafe —
      // comfortably before this child's measured ~3s exit, inside a case with 10.5s of
      // room, so the failsafe is what ends this and not vitest's own timeout.
      expect(failsafeFor(HAND_WRITTEN_CASE_TIMEOUT_MS)).toBe(500)

      await expect(
        runServer(
          { DATABASE_URL: 'postgresql://someuser:super-secret-pw@127.0.0.1:1/steuereule' },
          HAND_WRITTEN_CASE_TIMEOUT_MS,
        ),
      ).rejects.toThrow(/did not exit on its own/)
    },
    HAND_WRITTEN_CASE_TIMEOUT_MS,
  )
})
