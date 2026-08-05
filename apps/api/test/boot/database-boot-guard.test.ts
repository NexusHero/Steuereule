// The two negative cases ADR-0021 asks for before any "the guard holds" claim: this
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
// CI surface needed for it. What's missing, and what these two prove, is that the
// process refuses to even get that far under the two broken conditions a stakeholder's
// own docker setup can produce: the variable never set, and the variable set but wrong.
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

/** Boots `src/main.ts` as a real child process under an explicit (never inherited)
 *  env, and waits for it to exit on its own — a guard that hangs instead of failing
 *  fast is exactly as broken as one that doesn't fire at all. */
function runServer(env: Record<string, string>): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child: ChildProcessWithoutNullStreams = spawn(tsxBin, ['src/main.ts'], {
      cwd: apiRoot,
      // PATH (to find `node`, which tsx's shebang needs) and HOME (Node/tsx's own
      // cache lookups) are the only ambient values carried through; everything the
      // app itself reads is set explicitly below, per test.
      env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ...env },
    })

    let output = ''
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })

    // 30s, not 15s: the presence and connection-refused cases exit in ~3s, but the
    // cleanup-path case below deliberately drives Prisma into its own connection-pool
    // timeout, measured at ~13s to exit. This failsafe exists to catch a guard that
    // HANGS rather than failing fast, and 30s still does that with room for a slower
    // CI runner — a tighter bound would turn that case red for the wrong reason.
    const failSafe = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`server did not exit on its own within the test timeout — output so far:\n${output}`))
    }, 30_000)

    child.on('error', (error) => {
      clearTimeout(failSafe)
      reject(error)
    })
    child.on('exit', (code) => {
      clearTimeout(failSafe)
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
      const { code, output } = await runServer({ DATABASE_URL: '' })

      expect(code).not.toBe(0)
      expect(output).toMatch(/DATABASE_URL must be set/)
    },
    20_000,
  )

  it(
    'DATABASE_URL set but unreachable (wrong host/port — the stakeholder’s own failure mode) → exits non-zero with the reachability finding, host:port only, never the DSN',
    async () => {
      const { code, output } = await runServer({
        // Port 1 on loopback: nothing listens there, so this refuses the connection
        // immediately rather than waiting out the probe's own timeout — keeps the
        // test fast without weakening what it proves.
        DATABASE_URL: 'postgresql://someuser:super-secret-pw@127.0.0.1:1/steuereule',
      })

      expect(code).not.toBe(0)
      expect(output).toMatch(/Cannot reach the database at 127\.0\.0\.1:1/)
      expect(output).not.toContain('super-secret-pw')
      expect(output).not.toContain('someuser')
      // The presence finding must NOT also fire here — these are two distinct
      // findings and this run's actual defect is reachability, not presence.
      expect(output).not.toMatch(/DATABASE_URL must be set/)
    },
    20_000,
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
        const { code, output } = await runServer({
          DATABASE_URL: `postgresql://someuser:super-secret-pw@127.0.0.1:${address.port}/steuereule?connect_timeout=30`,
        })

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
    45_000,
  )
})
