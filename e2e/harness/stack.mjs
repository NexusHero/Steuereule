// One call brings the whole stack up — Postgres, migrations, the built API, the exported web
// bundle served on a second origin — and returns `{ apiOrigin, webOrigin, sql, stop() }`.
//
// WHY THIS FILE EXISTS (Salih's platform-engineer mandate, see .claude/agents/salih.md): the
// recipe for standing this stack up exists TODAY only as YAML in `.github/workflows/ci.yml`'s
// `cross-origin-smoke`/`integration`/`smoke` jobs — eleven-plus `run:` steps of bash, duplicated
// with small variations across three jobs, that nothing in this repo can `import`. Every local
// reproduction of "what does CI actually do" has been re-typed from scratch by hand, and thrown
// away afterwards. This module is that recipe, committed once, importable by any script —
// including CI's own steps, which can shrink to calling this instead of re-deriving it (not
// done in this pass — see the README's "Not done in this pass" section for why).
//
// TWO MODES, chosen automatically:
//
//   ATTACH mode (the default in CI): if API_ORIGIN/WEB_ORIGIN/DATABASE_URL are already set —
//   exactly the shape `cross-origin-smoke`'s own `env:` block provides — this module does NOT
//   start a second stack next to the one CI already booted. It attaches: returns those origins
//   verbatim, a `sql()` bound to DATABASE_URL, and a no-op `stop()` (CI's own job teardown owns
//   the processes this mode never started). This is what every gate script in `e2e/` already
//   assumes implicitly via `requireEnv('WEB_ORIGIN')`; `startStack()` centralises that
//   assumption instead of each script re-deriving it, and is a safe drop-in for any of them.
//
//   BOOT mode (local dev, or `{ boot: true }` explicitly): when those three env vars are absent,
//   this module stands the entire stack up itself — Postgres (docker compose, falling back to a
//   native `postgres`/`initdb` binary if the container registry is unreachable, see below),
//   `prisma migrate deploy`, build + boot the compiled API, `expo export --platform web --clear`,
//   and serve the export on a second origin via `e2e/cross-origin/static-server.mjs`'s already-
//   committed static server (reused, not duplicated). `stop()` tears down exactly what this call
//   started, in reverse order, PID-scoped (never a blanket process kill — #114's own rule).
//
// THE NATIVE-POSTGRES FALLBACK, why it exists: this environment's outbound network sits behind a
// proxy that has, in past sessions, blocked the Docker Hub registry outright — `docker compose up
// postgres` then hangs on an image pull that will never complete. A contributor with no visible
// Postgres and no visible error is the worst failure shape for a "one-command local stack" whose
// whole point is being usable without asking Salih first. The fallback: if `docker compose up -d
// postgres` doesn't reach a healthy `pg_isready` within FALLBACK_TIMEOUT_MS, this module looks for
// a `postgres`/`initdb` binary already on PATH (Debian/Ubuntu's `postgresql` apt package, already
// present on GitHub's `ubuntu-latest` runner image per its `runner-images` catalogue — the same
// fact `visibility-refetch.mjs`'s header comment already leans on for `psql`) and, if found,
// initialises a throwaway data directory under the OS temp dir and starts a native `postgres`
// process on the same port instead. Both paths converge on the identical `DATABASE_URL` shape, so
// nothing downstream (migrations, the API, this module's own `sql()`) needs to know which one ran.
//
// NOT EXERCISED IN THIS SESSION: docker was reachable here, so the native-fallback code path
// below has been read-reviewed and syntax-checked (`node --check`) but not run for real against a
// blocked registry. Said plainly rather than claimed — see this draft's own report.
import { execSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { startStaticServer } from '../cross-origin/static-server.mjs'

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))

const DEFAULTS = {
  apiOrigin: 'http://localhost:3301',
  webOrigin: 'http://localhost:4173',
  apiPort: '3301',
  webPort: 4173,
  databaseUrl: 'postgres://steuereule:steuereule@localhost:5432/steuereule',
  postgresHealthTimeoutMs: 30_000,
}

/**
 * Runs a shell command, streaming nothing (captured), throwing with both stdout and stderr on a
 * non-zero exit — every boot-mode step below uses this rather than a bare `execSync` so a
 * failure names exactly which step and what the tool actually printed, instead of a bare
 * "Command failed" a reader has to go re-run by hand to diagnose.
 */
function run(command, options = {}) {
  try {
    return execSync(command, { cwd: REPO_ROOT, stdio: 'pipe', encoding: 'utf8', ...options })
  } catch (error) {
    const stdout = error.stdout?.toString?.() ?? ''
    const stderr = error.stderr?.toString?.() ?? ''
    throw new Error(`stack.mjs: \`${command}\` failed.\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`, { cause: error })
  }
}

/** Polls a boolean check until it passes or `timeoutMs` elapses — event-driven arithmetic, never
 *  a fixed sleep (ADR-0004, the same convention every `ci.yml` "poll, no sleep" step follows). */
async function waitUntil(check, { timeoutMs = 30_000, intervalMs = 500, label = 'condition' } = {}) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await check()) return
    await sleep(intervalMs)
  }
  throw new Error(`stack.mjs: timed out after ${timeoutMs}ms waiting for ${label}.`)
}

async function httpReachable(url) {
  try {
    const response = await fetch(url)
    return response.status < 500
  } catch {
    return false
  }
}

/**
 * A minimal, dependency-free Postgres SQL runner via `psql` — the same technique
 * `visibility-refetch.mjs` already hand-rolls, lifted here as the ONE canonical version. Existing
 * scripts are not migrated to import this in this pass (see this file's header comment on why
 * duplication stands for now); new scripts should call this instead of re-deriving it.
 */
export function makeSql(databaseUrl) {
  const url = new URL(databaseUrl)
  const host = url.hostname
  const port = url.port || '5432'
  const user = decodeURIComponent(url.username)
  const password = decodeURIComponent(url.password)
  const database = url.pathname.slice(1)
  return function sql(query) {
    return execSync(`psql -h ${host} -p ${port} -U ${user} -d ${database} -t -A -c "${query.replace(/"/g, '\\"')}"`, {
      encoding: 'utf8',
      env: { ...process.env, PGPASSWORD: password },
    }).trim()
  }
}

async function pgIsReady(databaseUrl) {
  const url = new URL(databaseUrl)
  try {
    execSync(`pg_isready -h ${url.hostname} -p ${url.port || '5432'} -U ${decodeURIComponent(url.username)}`, { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

/** BOOT MODE step 1 — Postgres, docker first, native fallback second. Returns a teardown fn. */
async function startPostgres(databaseUrl) {
  try {
    run('docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d postgres')
    await waitUntil(() => pgIsReady(databaseUrl), { timeoutMs: DEFAULTS.postgresHealthTimeoutMs, label: 'docker-compose postgres to become ready' })
    console.log('[stack] Postgres up via docker compose.')
    return async () => run('docker compose -f docker-compose.yml -f docker-compose.e2e.yml down -v')
  } catch (dockerError) {
    console.warn(`[stack] docker compose postgres did not become healthy within ${DEFAULTS.postgresHealthTimeoutMs}ms — ` +
      `falling back to a native postgres binary (see this file's header comment). Docker error: ${dockerError.message}`)
  }

  if (!commandExists('initdb') || !commandExists('postgres') || !commandExists('pg_ctl')) {
    throw new Error(
      'stack.mjs: docker compose postgres failed and no native postgres/initdb/pg_ctl binaries are on PATH — ' +
        'cannot start Postgres by either mechanism. Install the `postgresql` package, or fix docker/the registry proxy.',
    )
  }

  const url = new URL(databaseUrl)
  const dataDir = await mkdtemp(join(tmpdir(), 'steuereule-pg-'))
  run(`initdb -D "${dataDir}" -U ${decodeURIComponent(url.username)} --auth=trust --no-locale --encoding=UTF8`)
  run(`pg_ctl -D "${dataDir}" -l "${join(dataDir, 'postgres.log')}" -o "-p ${url.port || '5432'}" start`)
  await waitUntil(() => pgIsReady(databaseUrl), { timeoutMs: DEFAULTS.postgresHealthTimeoutMs, label: 'native postgres to become ready' })
  run(`createdb -h ${url.hostname} -p ${url.port || '5432'} -U ${decodeURIComponent(url.username)} ${url.pathname.slice(1)}`)
  console.log(`[stack] Postgres up via native binaries at ${dataDir} (docker was unreachable).`)
  return async () => {
    run(`pg_ctl -D "${dataDir}" stop -m fast`)
    await rm(dataDir, { recursive: true, force: true })
  }
}

function commandExists(binary) {
  try {
    execSync(`command -v ${binary}`, { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

/** BOOT MODE step 2 — migrate + build + boot the compiled API. Returns a teardown fn. */
async function startApi({ apiOrigin, apiPort, webOrigin, databaseUrl, env }) {
  const apiEnv = {
    ...process.env,
    ...env,
    DATABASE_URL: databaseUrl,
    PORT: apiPort,
    BETTER_AUTH_URL: apiOrigin,
    CORS_ALLOWED_ORIGINS: webOrigin,
    WEB_APP_URL: webOrigin,
  }
  run('pnpm --filter @steuereule/api prisma:generate', { env: apiEnv })
  run('pnpm --filter @steuereule/api migrate:deploy', { env: apiEnv })
  run('pnpm --filter @steuereule/api build', { env: apiEnv })

  const child = spawn('node', ['--import', 'tsx', 'dist/main.js'], {
    cwd: join(REPO_ROOT, 'apps/api'),
    env: apiEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const logLines = []
  child.stdout.on('data', (chunk) => logLines.push(chunk.toString()))
  child.stderr.on('data', (chunk) => logLines.push(chunk.toString()))

  await waitUntil(() => httpReachable(`${apiOrigin}/v1/profile`), { timeoutMs: 30_000, label: 'the API to answer GET /v1/profile' }).catch((error) => {
    throw new Error(`${error.message}\n--- API log so far ---\n${logLines.join('')}`)
  })
  console.log(`[stack] API up at ${apiOrigin} (pid ${child.pid}).`)
  return async () => {
    child.kill()
  }
}

/** BOOT MODE step 3 — `expo export --clear` + serve the bundle on its own origin. Returns a
 *  teardown fn. `--clear` is load-bearing, not defensive (see the README): Metro caches the
 *  `EXPO_PUBLIC_API_BASE_URL` a prior export baked in, so a second export with a different API
 *  origin and no `--clear` silently ships the STALE origin — a class of bug that looks exactly
 *  like a CORS failure and wastes real time being misdiagnosed as one. */
async function startWeb({ apiOrigin, webOrigin, webPort }) {
  run(`pnpm --filter @steuereule/mobile-web exec expo export --platform web --clear`, {
    env: { ...process.env, EXPO_PUBLIC_API_BASE_URL: apiOrigin },
  })
  const server = await startStaticServer(join(REPO_ROOT, 'apps/mobile-web/dist'), webPort, 'localhost')
  await waitUntil(() => httpReachable(`${webOrigin}/`), { timeoutMs: 10_000, label: 'the exported web bundle to answer' })
  console.log(`[stack] Web bundle up at ${webOrigin}.`)
  return async () => new Promise((resolvePromise) => server.close(() => resolvePromise()))
}

/**
 * Brings the stack up (attach to CI's own, or boot a fresh one locally) and returns
 * `{ apiOrigin, webOrigin, sql, stop }`. `options.boot` forces boot mode even if the attach-mode
 * env vars happen to be set (useful for locally reproducing exactly what CI's job does, on a
 * second, disposable stack, without touching whatever else is running).
 */
export async function startStack(options = {}) {
  const attachModeEnvPresent = process.env.API_ORIGIN && process.env.WEB_ORIGIN && process.env.DATABASE_URL
  const boot = options.boot ?? !attachModeEnvPresent

  if (!boot) {
    console.log('[stack] ATTACH mode — API_ORIGIN/WEB_ORIGIN/DATABASE_URL already set, reusing the caller\'s own stack.')
    return {
      apiOrigin: process.env.API_ORIGIN,
      webOrigin: process.env.WEB_ORIGIN,
      sql: makeSql(process.env.DATABASE_URL),
      stop: async () => {},
    }
  }

  console.log('[stack] BOOT mode — starting Postgres, the API and the exported web bundle from scratch.')
  const apiOrigin = options.apiOrigin ?? DEFAULTS.apiOrigin
  const webOrigin = options.webOrigin ?? DEFAULTS.webOrigin
  const databaseUrl = options.databaseUrl ?? DEFAULTS.databaseUrl

  const teardowns = []
  try {
    teardowns.push(await startPostgres(databaseUrl))
    teardowns.push(await startApi({ apiOrigin, apiPort: String(options.apiPort ?? DEFAULTS.apiPort), webOrigin, databaseUrl, env: options.apiEnv ?? {} }))
    teardowns.push(await startWeb({ apiOrigin, webOrigin, webPort: options.webPort ?? DEFAULTS.webPort }))
  } catch (error) {
    // Tear down whatever DID start before propagating — a failed boot must not leak a Postgres
    // container/native process or a bound port for the next run to trip over.
    await stopAll(teardowns)
    throw error
  }

  return {
    apiOrigin,
    webOrigin,
    sql: makeSql(databaseUrl),
    stop: () => stopAll(teardowns),
  }
}

async function stopAll(teardowns) {
  for (const teardown of teardowns.toReversed()) {
    await teardown().catch((error) => console.warn(`[stack] teardown step failed (continuing): ${error.message}`))
  }
}

// CLI entry point — `node e2e/harness/stack.mjs` boots the stack standalone and leaves it
// running (prints the origins, does not call `stop()`) for a contributor who just wants a real
// local seeded stack to click through by hand. Ctrl-C leaves the processes running, matching
// `docker-compose.yml`'s own detached-by-default local-dev shape — run `docker compose down` /
// kill the printed PIDs yourself, the same as any other local-dev boot in this repo.
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  if (!existsSync(join(REPO_ROOT, 'package.json'))) {
    // A loud, named failure here is cheaper than a confusing ENOENT three functions later if
    // this module is ever relocated without updating the `../../` root computation above.
    throw new Error(`stack.mjs: computed REPO_ROOT ${REPO_ROOT} does not look like the repo root (no package.json).`)
  }
  const stack = await startStack({ boot: true })
  console.log(`\n[stack] Ready.\n  API: ${stack.apiOrigin}\n  Web: ${stack.webOrigin}\n`)
}
