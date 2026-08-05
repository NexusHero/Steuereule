// The two negative cases ADR-0021 asks for before any "the guard holds" claim: this
// spawns the REAL production entry point (`tsx src/main.ts`, the same "run without a
// build step" bridge ADR-0010a's smoke job uses for `dist/main.js`) as its own child
// process, with an explicit, hand-built env — never `...process.env`. That's the
// deliberate break from every other test file in this suite: `vitest.config.ts`
// injects a syntactically-valid `DATABASE_URL` into every in-process test's env before
// any test body runs (see its own comment), so no test running inside that process
// could ever observe "DATABASE_URL is unset" — the exact condition this guard exists
// to catch. A real child process, given a real env object we control top to bottom, is
// the only way to reach it.
//
// The positive case (a real, reachable Postgres) is already covered by CI's `smoke`
// job (ci.yml, boots `dist/main.js` against a live service-container Postgres) — no new
// CI surface needed for it. What's missing, and what these two prove, is that the
// process refuses to even get that far under the two broken conditions a stakeholder's
// own docker setup can produce: the variable never set, and the variable set but wrong.
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
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

    const failSafe = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`server did not exit on its own within the test timeout — output so far:\n${output}`))
    }, 15_000)

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
  it(
    'DATABASE_URL unset → exits non-zero with the presence finding, not a silent boot',
    async () => {
      const { code, output } = await runServer({})

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
})
