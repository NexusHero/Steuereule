// Builds the two source trees assert-env-not-file-sourced.test.ts needs, plus a deliberately
// ordering-broken entry point for the control-proof case (ADR-0021).
//
// HISTORY. Up to Prisma 6 the generated client merged a schema-adjacent `.env` into `process.env` as an
// import side effect (#284, ADR-0028); this fixture generated one client with and one without that
// behaviour. Prisma 7's client reads no file at all, so the leak can no longer come from there. The guard
// in src/config/assert-env-not-file-sourced.ts stays: it does not care WHO fills the environment during
// start-up, only that a guarded value arrived after the process began.
//
// THE TWO TREES NOW.
//   - `without-env`: a plain copy of `src/`, running the real Prisma 7 client. With `apps/api/.env` on
//     disk it shows that nothing reads the file any more.
//   - `with-env`: the same copy, plus `src/fixture-env-merge.ts`, imported first thing by the copied
//     `app.module.ts`. It merges `apps/api/.env` into `process.env`, fill-only, exactly where and how the
//     Prisma 6 client did. It stands in for any dependency that does this, so the guard keeps a control
//     proof against the real entry point.
//
// The trees live under `apps/api/.generated-test-clients/<state>/src/`: every bare specifier climbs to the
// real `apps/api/node_modules`, so no shared state is mutated except the ONE thing this control exists to
// observe, whether `apps/api/.env` is on disk (created once here, removed in `cleanup()`). That is safe
// for every other in-process test file, because `vitest.config.ts` sets all seven guarded vars in every
// worker's `process.env` before any test runs, and the merge is fill-only.
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { cpSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerExitCleanup } from './run-server.js'

const apiRoot = fileURLToPath(new URL('../../../', import.meta.url))
const envPath = path.join(apiRoot, '.env')
const BACKUP_FILE_PREFIX = '.env.robin-284-backup-'
const envBackupPath = path.join(apiRoot, `${BACKUP_FILE_PREFIX}${randomUUID()}`)
const fixtureRoot = path.join(apiRoot, '.generated-test-clients')

const SNAPSHOT_IMPORT_MARKER = "import './config/env-snapshot.js'"
const APP_MODULE_IMPORT_MARKER = "import { AppModule } from './app.module.js'"

/** No PII, no real secret (repo rule) — one clearly-fixture value per guarded name, so
 *  a test assertion can tell "this is the fixture's own dummy value" apart from
 *  anything a developer's real local .env might contain. The DATABASE_URL points at a
 *  port nothing listens on (same shape database-boot-guard.test.ts already uses), so
 *  if a case ever did get far enough to dial it, it fails fast rather than hanging. */
const FIXTURE_ENV_CONTENT = [
  'DATABASE_URL=postgresql://robin-284-fixture:robin-284-fixture@127.0.0.1:1/robin-284-fixture',
  'GUEST_SESSION_SECRET=robin-284-fixture-guest-session-secret',
  'PRISMA_FIELD_ENCRYPTION_KEY=k1.aesgcm256.MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
  'BETTER_AUTH_SECRET=robin-284-fixture-better-auth-secret',
  'BETTER_AUTH_URL=http://127.0.0.1:1',
  'CORS_ALLOWED_ORIGINS=http://127.0.0.1:1',
  'PORT=1',
  // Not guarded by assertEnvNotFileSourced, but needed by the production configuration check that runs right
  // after it (src/config/production-config.ts): a complete local stack (loopback origins only), so the cases that
  // must get past both guards reach the database reachability guard.
  'WEB_APP_URL=http://127.0.0.1:1',
  'TRUSTED_PROXIES=none',
  'KEYSTORE_DATABASE_URL=postgresql://robin-284-fixture:robin-284-fixture@127.0.0.1:1/robin-284-fixture-keystore',
  'PRISMA_FIELD_ENCRYPTION_HASH_SALT=robin-284-fixture-email-hash-salt-0123456789',
  'KEYSTORE_MASTER_KEY=robin-284-fixture-keystore-master-key-0123456789',
  '',
].join('\n')

export interface ClientFixtures {
  /** Absolute path to `main.ts` in a src copy whose `@prisma/client` was generated
   *  WITH `apps/api/.env` present — the merge-capable state (table rows 1/2). */
  withEnvEntryPath: string
  /** Same generated client as `withEnvEntryPath`, same src copy, but this entry point
   *  has the env-snapshot import moved to AFTER `./app.module.js`'s — the
   *  ordering-broken control-proof fixture (ADR-0021, table row 4). */
  withEnvBrokenOrderingEntryPath: string
  /** Absolute path to `main.ts` in a src copy whose `@prisma/client` was generated
   *  WITHOUT `apps/api/.env` present — the non-merge-capable state (table row 3). */
  withoutEnvEntryPath: string
  /** Pass as `TSX_TSCONFIG_PATH` in `runServer`'s env for `withEnvEntryPath`/
   *  `withEnvBrokenOrderingEntryPath`. Measured while building this fixture: tsx's own
   *  tsconfig auto-discovery is unreliable against a brand-new (never-before-transformed)
   *  directory tree — some files in the copy transform without `experimentalDecorators`
   *  even though the tsconfig at the copy's root has it enabled and even with `--no-cache`
   *  / an explicit `--tsconfig` CLI flag. Setting `TSX_TSCONFIG_PATH` (tsx's own env-var
   *  override, read by its loader hook, not just its CLI entry) is what actually made this
   *  deterministic — the real, uncopied `apps/api/src/main.ts` never needed it because its
   *  tsconfig resolution has been exercised (and presumably cached somewhere) by every
   *  earlier test run in this suite. */
  withEnvTsconfigPath: string
  /** Same, for `withoutEnvEntryPath`. */
  withoutEnvTsconfigPath: string
  /** Compiles the with-env src copy (real and ordering-broken entry points alike) with `tsc`, the way `pnpm build`
   *  does, and returns the emitted entry points for `node`. Lazy and cached: only the case that needs the compiled
   *  path pays for the compile (#314). */
  compileWithEnv(): { entryPath: string; brokenOrderingEntryPath: string }
  /** Removes every file this function created and restores whatever `apps/api/.env`
   *  looked like beforehand (present, with its original bytes, or absent). Always
   *  call from `afterAll`, even if `build()` itself threw partway through — see the
   *  caller's own try/finally. */
  cleanup(): void
}

interface ParsedTsconfig {
  extends?: unknown
  compilerOptions: Record<string, unknown>
}

function readTsconfig(tsconfigPath: string): ParsedTsconfig {
  return JSON.parse(readFileSync(tsconfigPath, 'utf8')) as ParsedTsconfig
}

// The path-relative keys the shallow flatten below cannot correctly reproduce — a value
// under one of these resolves relative to the FILE it's declared in, and a `{...base,
// ...api}` merge written at the fixture root has no file of its own to resolve against
// (Musti's F4). `rootDir`/`outDir` are also path-relative but deliberately excluded:
// tsx does not consult either (measured while building this fixture — see the header's
// TSX_TSCONFIG_PATH paragraph).
const PATH_RELATIVE_COMPILER_OPTION_KEYS = ['paths', 'baseUrl', 'typeRoots'] as const

/** Throws the day the flatten in `buildClientFixtures()` stops being faithful to
 *  production (#284 F4) — a note next to the flatten is not a control (F12,
 *  run-server.ts). A shallow `{...base, ...api}` merge is only equivalent to the real
 *  `apps/api/tsconfig.json` → `tsconfig.base.json` extends chain while NEITHER config
 *  resolves anything relative to its OWN file: the day `tsconfig.base.json` gains its
 *  own `extends`, or either file's `compilerOptions` gains `paths`/`baseUrl`/
 *  `typeRoots`, this fixture would transform the copied `src/` under different options
 *  than production produces — with nothing going red, because the divergence is in HOW
 *  it compiled, not whether it compiled. */
function assertTsconfigIsFlattenable(baseTsconfigPath: string, baseTsconfig: ParsedTsconfig, apiCompilerOptions: Record<string, unknown>): void {
  if (baseTsconfig.extends !== undefined) {
    throw new Error(
      `env-snapshot-client-fixtures: ${baseTsconfigPath} now has its own "extends" — the shallow ` +
        'two-file flatten this fixture does is no longer faithful to the real extends chain. Teach ' +
        'this fixture to follow the longer chain, or stop flattening and depend on tsx/get-tsconfig ' +
        'resolving it correctly (measured unreliable against a freshly-copied tree — see this file’s header).',
    )
  }
  for (const compilerOptions of [baseTsconfig.compilerOptions, apiCompilerOptions]) {
    for (const key of PATH_RELATIVE_COMPILER_OPTION_KEYS) {
      if (compilerOptions[key] !== undefined) {
        throw new Error(
          `env-snapshot-client-fixtures: compilerOptions.${key} is now set — a path-relative option a ` +
            'shallow flatten at a different directory depth would resolve differently than production. ' +
            'Teach this fixture to rebase it, or stop flattening.',
        )
      }
    }
  }
}

const ENV_MERGE_MODULE = 'fixture-env-merge'

/**
 * Makes the copied tree behave like one whose dependency merges a file into the environment at import:
 * `app.module.ts` imports a module that loads `apps/api/.env`. `process.loadEnvFile` never overwrites a
 * variable that is already set, which is the fill-only merge the Prisma 6 client did.
 */
function addEnvMergeAtImport(treeDir: string): void {
  writeFileSync(
    path.join(treeDir, 'src', `${ENV_MERGE_MODULE}.ts`),
    [
      "import { existsSync } from 'node:fs'",
      "import process from 'node:process'",
      '',
      `const envFile = ${JSON.stringify(envPath)}`,
      'if (existsSync(envFile)) process.loadEnvFile(envFile)',
      '',
    ].join('\n'),
  )
  const appModulePath = path.join(treeDir, 'src', 'app.module.ts')
  writeFileSync(appModulePath, `import './${ENV_MERGE_MODULE}.js'\n${readFileSync(appModulePath, 'utf8')}`)
}

function deriveBrokenOrderingEntry(realMainTsPath: string, outputPath: string): void {
  const original = readFileSync(realMainTsPath, 'utf8')
  const snapshotIndex = original.indexOf(SNAPSHOT_IMPORT_MARKER)
  if (snapshotIndex === -1) {
    throw new Error(`env-snapshot-client-fixtures: ${JSON.stringify(SNAPSHOT_IMPORT_MARKER)} not found in main.ts`)
  }
  const appModuleIndexInOriginal = original.indexOf(APP_MODULE_IMPORT_MARKER)
  if (appModuleIndexInOriginal === -1) {
    throw new Error(`env-snapshot-client-fixtures: ${JSON.stringify(APP_MODULE_IMPORT_MARKER)} not found in main.ts`)
  }
  if (snapshotIndex > appModuleIndexInOriginal) {
    throw new Error(
      `env-snapshot-client-fixtures: main.ts's ${JSON.stringify(SNAPSHOT_IMPORT_MARKER)} import no longer ` +
        `precedes ${JSON.stringify(APP_MODULE_IMPORT_MARKER)} — the #284 ordering invariant is broken. Fix ` +
        'main.ts, not this fixture.',
    )
  }

  const snapshotLineEnd = original.indexOf('\n', snapshotIndex) + 1
  const snapshotBlock = original.slice(0, snapshotLineEnd) // file start through the snapshot import line, comment included
  const rest = original.slice(snapshotLineEnd)

  // appModuleIndex cannot be -1 here: the precondition above already found the marker
  // in `original` strictly after `snapshotIndex`, i.e. inside `rest` by construction.
  const appModuleIndex = rest.indexOf(APP_MODULE_IMPORT_MARKER)
  const appModuleLineEnd = rest.indexOf('\n', appModuleIndex) + 1

  const broken = rest.slice(0, appModuleLineEnd) + snapshotBlock + rest.slice(appModuleLineEnd)

  writeFileSync(outputPath, broken)
}

/** Self-heal (#284 F1, reproduced): a PREVIOUS run that was killed mid-suite (SIGINT
 *  reaches the exit-cleanup below and is enough to prevent this; a SIGKILL cannot be
 *  intercepted by anything, so this is the backstop for that) can leave the real
 *  `apps/api/.env` sitting under `.env.robin-284-backup-*` with the fixture's own
 *  content at `.env` in its place. Called FIRST in `buildClientFixtures()`, before this
 *  run backs anything up: restoring an existing backup before making a new one is what
 *  keeps a recoverable mess recoverable. Backing up OVER an existing backup — the bug
 *  Musti reproduced — orphans the real file permanently, because `envBackupPath` is
 *  freshly randomised per run and nothing was ever going to look at the OLD name again. */
function restoreStaleBackupIfAny(): void {
  const stale = readdirSync(apiRoot).find((name) => name.startsWith(BACKUP_FILE_PREFIX))
  if (!stale) return
  rmSync(envPath, { force: true })
  renameSync(path.join(apiRoot, stale), envPath)
}

/** Builds both client states plus the ordering-broken fixture. Call once in
 *  `beforeAll`; every case in the suite reuses the same three entry points. */
export function buildClientFixtures(): ClientFixtures {
  restoreStaleBackupIfAny()

  rmSync(fixtureRoot, { recursive: true, force: true })
  mkdirSync(fixtureRoot, { recursive: true })

  const hadRealEnv = (() => {
    try {
      renameSync(envPath, envBackupPath)
      return true
    } catch {
      return false
    }
  })()

  // Registered as soon as the backup above could have happened, through the ONE
  // exit/signal registration point this test tier has (#284 F1 — see
  // run-server.ts's registerExitCleanup for why this isn't a second, independent
  // mechanism). `cleaned` makes `runCleanup` idempotent: the explicit `cleanup()` a
  // test's own `afterAll` calls and this exit-time fallback can both fire for the same
  // normal run, and the second call must be a no-op — `cleanup()` itself is NOT safe to
  // call twice (its `rmSync(envPath)` would delete a just-restored real `.env` before
  // failing on the already-consumed backup).
  let cleaned = false
  const runCleanup = (): void => {
    if (cleaned) return
    cleaned = true
    cleanup(hadRealEnv)
  }
  registerExitCleanup(runCleanup)

  try {
    // 1. Generate the WITHOUT-env state first, while apps/api/.env is genuinely absent.
    const withoutEnvDir = path.join(fixtureRoot, 'without-env')
    const withEnvDir = path.join(fixtureRoot, 'with-env')
    writeFileSync(envPath, FIXTURE_ENV_CONTENT)

    cpSync(path.join(apiRoot, 'src'), path.join(withoutEnvDir, 'src'), { recursive: true })
    cpSync(path.join(apiRoot, 'src'), path.join(withEnvDir, 'src'), { recursive: true })
    addEnvMergeAtImport(withEnvDir)

    const baseTsconfigPath = path.join(apiRoot, '..', '..', 'tsconfig.base.json')
    const baseTsconfig = readTsconfig(baseTsconfigPath)
    const apiTsconfig = readTsconfig(path.join(apiRoot, 'tsconfig.json'))
    assertTsconfigIsFlattenable(baseTsconfigPath, baseTsconfig, apiTsconfig.compilerOptions)
    const tsconfigContent = JSON.stringify({
      compilerOptions: { ...baseTsconfig.compilerOptions, ...apiTsconfig.compilerOptions },
    })
    writeFileSync(path.join(withoutEnvDir, 'tsconfig.json'), tsconfigContent)
    writeFileSync(path.join(withEnvDir, 'tsconfig.json'), tsconfigContent)

    // 5. Derive the ordering-broken entry point from the WITH-env copy's own main.ts.
    const withEnvMainTsPath = path.join(withEnvDir, 'src', 'main.ts')
    const brokenOrderingPath = path.join(withEnvDir, 'src', 'main-broken-ordering.ts')
    deriveBrokenOrderingEntry(withEnvMainTsPath, brokenOrderingPath)

    return {
      withEnvEntryPath: withEnvMainTsPath,
      withEnvBrokenOrderingEntryPath: brokenOrderingPath,
      withoutEnvEntryPath: path.join(withoutEnvDir, 'src', 'main.ts'),
      withEnvTsconfigPath: path.join(withEnvDir, 'tsconfig.json'),
      withoutEnvTsconfigPath: path.join(withoutEnvDir, 'tsconfig.json'),
      compileWithEnv: () => compileWithEnvOnce(withEnvDir),
      cleanup: runCleanup,
    }
  } catch (error) {
    runCleanup()
    throw error
  }
}

let compiled: { entryPath: string; brokenOrderingEntryPath: string } | undefined

/** `tsc` over the fixture's own src copy, with the same flattened compilerOptions the fixture's tsconfig.json
 *  carries (so it is faithful to `apps/api/tsconfig.json` for as long as `assertTsconfigIsFlattenable` holds),
 *  emitting to `<fixture>/dist`. Throws with tsc's own output when it does not compile. */
function compileWithEnvOnce(withEnvDir: string): { entryPath: string; brokenOrderingEntryPath: string } {
  if (compiled) return compiled
  const compileConfig = path.join(withEnvDir, 'tsconfig.compile.json')
  writeFileSync(
    compileConfig,
    JSON.stringify({
      extends: './tsconfig.json',
      compilerOptions: { rootDir: 'src', outDir: 'dist', noEmit: false },
      include: ['src'],
    }),
  )
  try {
    execFileSync(path.join(apiRoot, 'node_modules', '.bin', 'tsc'), ['-p', compileConfig], { cwd: withEnvDir, stdio: 'pipe' })
  } catch (error) {
    const out = error as { stdout?: Buffer }
    throw new Error(`env-snapshot-client-fixtures: tsc failed on the fixture copy:\n${out.stdout?.toString() ?? String(error)}`, { cause: error })
  }
  compiled = {
    entryPath: path.join(withEnvDir, 'dist', 'main.js'),
    brokenOrderingEntryPath: path.join(withEnvDir, 'dist', 'main-broken-ordering.js'),
  }
  return compiled
}

function cleanup(hadRealEnv: boolean): void {
  compiled = undefined
  rmSync(fixtureRoot, { recursive: true, force: true })
  rmSync(envPath, { force: true })
  if (hadRealEnv) {
    renameSync(envBackupPath, envPath)
  }
}
