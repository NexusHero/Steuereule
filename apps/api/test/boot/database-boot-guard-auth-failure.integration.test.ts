// The end-to-end companion to redact-cause.test.ts's pure-function proof and
// database-boot-guard.test.ts's connection-refused proof: this is the ONE failure class
// that actually needs a real, reachable Postgres to reproduce honestly — a right
// host/port with the WRONG password, which Prisma reports as an authentication failure
// that names the configured *username* directly in its own error message (measured
// against the real integration-tier database below, not assumed). Real-Postgres cascade
// (ADR-0004): run via `pnpm --filter @steuereule/api test:integration`, never the plain
// no-DB `pnpm -r test` job — this is exactly why it's suffixed `.integration.test.ts`
// rather than living next to its two siblings in the plain unit tier.
//
// Proves the full pipeline, not just `redactCause` in isolation: spawns the real
// `tsx src/main.ts` entry point against the integration DB's real host/port/user with a
// deliberately wrong password, and asserts the real username configured for this test
// run never appears anywhere in the process's combined stdout+stderr — the same
// container-log-shaped check database-boot-guard.test.ts uses, against the one failure
// class that needed a live server to actually produce.
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { resolveDatabaseUrl } from '../../src/config/database-url.js'

const apiRoot = fileURLToPath(new URL('../../', import.meta.url))
const tsxBin = fileURLToPath(new URL('../../node_modules/.bin/tsx', import.meta.url))

function runServer(env: Record<string, string>): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const child: ChildProcessWithoutNullStreams = spawn(tsxBin, ['src/main.ts'], {
      cwd: apiRoot,
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

describe('the real server, given a real database it cannot authenticate against', () => {
  it(
    'exits non-zero and never names the configured username in its combined stdout+stderr',
    async () => {
      const realDatabaseUrl = resolveDatabaseUrl()
      const parsed = new URL(realDatabaseUrl)
      const username = parsed.username
      // Same host/port/db/user as the real integration database — only the password is
      // wrong, so the server genuinely reaches Postgres and gets a real P1000 back,
      // rather than the connection-refused case its sibling test already covers.
      parsed.password = `${parsed.password}-deliberately-wrong`
      const wrongPasswordUrl = parsed.toString()

      const { code, output } = await runServer({ DATABASE_URL: wrongPasswordUrl })

      expect(code).not.toBe(0)
      expect(output).toMatch(/Cannot reach the database at/)
      expect(output).not.toContain(username)
      expect(output).not.toContain(parsed.password)
    },
    20_000,
  )
})
