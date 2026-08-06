// Builds the two Prisma client generation states assert-env-not-file-sourced.test.ts's
// acceptance table needs (#284, Musti's ruling: "the test must run `prisma generate`
// into two states... generate once per state in setup, not per test"), plus a
// deliberately ordering-broken entry point for the control-proof case (ADR-0021).
//
// WHY A NESTED node_modules COPY, NOT A SWAP OF apps/api/node_modules/@prisma/client:
// swapping the real, shared client — even temporarily, even restored in a `finally` —
// would be visible to every OTHER test file that also imports it in-process, and
// vitest runs test files in parallel by default. Measured instead: `prisma generate`
// with a custom `generator client { output = <path> }` produces a fully self-contained
// client folder (own package.json/index.js, no `.prisma/client` indirection), and
// Node's module resolution for a bare `@prisma/client` specifier climbs from the
// IMPORTING FILE's own directory up through each ancestor's `node_modules` — so a
// throwaway `src/` copy placed at `apps/api/.generated-test-clients/<state>/src/`,
// with ONLY `@prisma/client` overridden in a `node_modules/` sitting right next to
// it, resolves `@prisma/client` to OUR generated client while every other bare
// specifier (fastify, @nestjs/*, ...) keeps climbing past our empty override and
// finds the real `apps/api/node_modules` untouched. No shared state is ever mutated
// except the ONE thing this control exists to observe: whether `apps/api/.env` is on
// disk (created once here, removed in `cleanup()`) — and that is safe for every other
// in-process test file too, because `vitest.config.ts` already sets all seven guarded
// vars in every worker's `process.env` before any test runs, and the merge this whole
// ticket is about is measured fill-only (#275 F7): a value already present can never
// be overwritten by a stray file appearing or disappearing on disk mid-run.
//
// MEASURED, NOT ASSUMED (Musti's explicit flag: "ob ein sauberer pnpm install in
// diesem Repo ein nicht-leeres schemaEnvPath backt — miss es"): a clean `pnpm install`
// in a fresh worktree of this repo, no `apps/api/.env` on disk, bakes
// `relativeEnvPaths` with ONLY `rootEnvPath: null` — the `schemaEnvPath` key is
// genuinely ABSENT, not present-and-null. Re-running `prisma generate` with
// `apps/api/.env` present bakes `schemaEnvPath: "../../../../../../apps/api/.env"`.
// Both states measured directly by reading the generated `index.js`, on this ticket,
// before this fixture was written. `prisma generate` itself measured at ~150–500ms
// per call (cached query engine, no network) — the two generations this fixture does
// add well under a second to the suite, nowhere near the CI-cost concern Musti flagged.
//
// A generated client's baked `.env` path is relative to `__dirname` READ AT RUNTIME
// (`config.dirname = __dirname` in the generated `index.js`), not an absolute string
// baked at generate time — so a client MUST be generated directly at the path it will
// actually run from. Generate-then-copy silently breaks the relative offset back to
// `apps/api/.env` (measured while building this fixture: a copied client resolved a
// nonexistent path and the merge simply didn't fire, no error). Every client below is
// therefore generated in place, never copied.
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { cpSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const apiRoot = fileURLToPath(new URL('../../../', import.meta.url))
const realSchemaPath = path.join(apiRoot, 'prisma', 'schema.prisma')
const envPath = path.join(apiRoot, '.env')
const envBackupPath = path.join(apiRoot, `.env.robin-284-backup-${randomUUID()}`)
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
  /** Removes every file this function created and restores whatever `apps/api/.env`
   *  looked like beforehand (present, with its original bytes, or absent). Always
   *  call from `afterAll`, even if `build()` itself threw partway through — see the
   *  caller's own try/finally. */
  cleanup(): void
}

function readCompilerOptions(tsconfigPath: string): Record<string, unknown> {
  const parsed = JSON.parse(readFileSync(tsconfigPath, 'utf8')) as { compilerOptions: Record<string, unknown> }
  return parsed.compilerOptions
}

function runPrismaGenerate(schemaPath: string): void {
  execFileSync(path.join(apiRoot, 'node_modules', '.bin', 'prisma'), ['generate', `--schema=${schemaPath}`], {
    cwd: apiRoot,
    stdio: 'pipe',
  })
}

/** Writes a throwaway schema.prisma NEXT TO the real one (same directory — the
 *  relative distance from schema to "project root .env" is what Prisma's env search
 *  actually uses, and moving the schema itself would test a different topology than
 *  production's), identical except for a custom `output`, generates it, then removes
 *  the throwaway schema file (never the real one — the real, tracked schema.prisma is
 *  never written to by this fixture). */
function generateClientAt(outputDir: string, label: string): void {
  const schemaContents = readFileSync(realSchemaPath, 'utf8')
  const marker = 'provider = "prisma-client-js"'
  if (!schemaContents.includes(marker)) {
    throw new Error(`env-snapshot-client-fixtures: expected to find ${JSON.stringify(marker)} in schema.prisma`)
  }
  const tempSchemaPath = path.join(apiRoot, 'prisma', `.generated-test-schema-${label}-${randomUUID()}.prisma`)
  const tempSchemaContents = schemaContents.replace(marker, `${marker}\n  output   = ${JSON.stringify(outputDir)}`)
  writeFileSync(tempSchemaPath, tempSchemaContents)
  try {
    runPrismaGenerate(tempSchemaPath)
  } finally {
    rmSync(tempSchemaPath, { force: true })
  }
}

/** Derives the ordering-broken entry point from the REAL (copied) `main.ts` by moving
 *  the whole env-snapshot import block — its explanatory comment included — to just
 *  after the `./app.module.js` import, rather than hand-maintaining a second literal
 *  copy that could silently drift from what `main.ts` actually says. Throws instead of
 *  producing a silently-unbroken copy if either marker is missing (Musti's own amendment
 *  to ADR-0021: confirm a break actually landed before trusting the run it produces). */
function deriveBrokenOrderingEntry(realMainTsPath: string, outputPath: string): void {
  const original = readFileSync(realMainTsPath, 'utf8')
  const snapshotIndex = original.indexOf(SNAPSHOT_IMPORT_MARKER)
  if (snapshotIndex === -1) {
    throw new Error(`env-snapshot-client-fixtures: ${JSON.stringify(SNAPSHOT_IMPORT_MARKER)} not found in main.ts`)
  }
  const snapshotLineEnd = original.indexOf('\n', snapshotIndex) + 1
  const snapshotBlock = original.slice(0, snapshotLineEnd) // file start through the snapshot import line, comment included
  const rest = original.slice(snapshotLineEnd)

  const appModuleIndex = rest.indexOf(APP_MODULE_IMPORT_MARKER)
  if (appModuleIndex === -1) {
    throw new Error(`env-snapshot-client-fixtures: ${JSON.stringify(APP_MODULE_IMPORT_MARKER)} not found in main.ts`)
  }
  const appModuleLineEnd = rest.indexOf('\n', appModuleIndex) + 1

  const broken = rest.slice(0, appModuleLineEnd) + snapshotBlock + rest.slice(appModuleLineEnd)

  // Confirm the break actually landed (Musti's amendment to ADR-0021) rather than
  // trusting string surgery blind: the snapshot import must now appear strictly AFTER
  // the app.module import in the derived file.
  if (broken.indexOf(APP_MODULE_IMPORT_MARKER) > broken.indexOf(SNAPSHOT_IMPORT_MARKER)) {
    throw new Error('env-snapshot-client-fixtures: ordering-broken entry point did not actually reorder the imports')
  }

  writeFileSync(outputPath, broken)
}

/** Builds both client states plus the ordering-broken fixture. Call once in
 *  `beforeAll`; every case in the suite reuses the same three entry points. */
export function buildClientFixtures(): ClientFixtures {
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

  try {
    // 1. Generate the WITHOUT-env state first, while apps/api/.env is genuinely absent.
    const withoutEnvDir = path.join(fixtureRoot, 'without-env')
    generateClientAt(path.join(withoutEnvDir, 'node_modules', '@prisma', 'client'), 'without-env')

    // 2. Write the synthetic, non-PII .env — present for every generation and every
    //    child-process run from here on, restored/removed only in cleanup().
    writeFileSync(envPath, FIXTURE_ENV_CONTENT)

    // 3. Generate the WITH-env state.
    const withEnvDir = path.join(fixtureRoot, 'with-env')
    generateClientAt(path.join(withEnvDir, 'node_modules', '@prisma', 'client'), 'with-env')

    // 4. Copy the real src/ tree into both fixture roots — real files, not symlinks:
    //    Node resolves a symlinked module to its REAL path by default, which would
    //    make the copy's own node_modules override irrelevant (measured while building
    //    this fixture). A real copy keeps every importer's own path inside the fixture
    //    tree, so resolution climbs from there and finds our override first.
    cpSync(path.join(apiRoot, 'src'), path.join(withoutEnvDir, 'src'), { recursive: true })
    cpSync(path.join(apiRoot, 'src'), path.join(withEnvDir, 'src'), { recursive: true })

    // 4a. A self-contained tsconfig.json per fixture root — the REAL apps/api
    //     compilerOptions (which itself resolves experimentalDecorators/
    //     emitDecoratorMetadata from tsconfig.base.json), FLATTENED, with no `extends`
    //     field at all. Nest's DI/decorator metadata needs the real compilerOptions to
    //     transform correctly (same requirement vitest.config.ts's own header comment
    //     documents for unplugin-swc), so this reads the two real files rather than
    //     hand-duplicating them — but it does not point tsx at the real files via
    //     `extends` and let IT resolve the chain: measured while building this fixture,
    //     a two-hop `extends` (fixture -> apps/api/tsconfig.json -> tsconfig.base.json)
    //     reliably transforms fresh-auth.ts's decorator without experimentalDecorators
    //     applied, deterministically, every run — an upstream tsx/get-tsconfig defect in
    //     cross-directory extends-chain resolution against a directory tree tsx has
    //     never seen before (the real, un-copied apps/api/src never hits it, decorators
    //     used there for years). Flattening it here, once, in plain JS, side-steps that
    //     resolver instead of depending on it.
    const baseCompilerOptions = readCompilerOptions(path.join(apiRoot, '..', '..', 'tsconfig.base.json'))
    const apiCompilerOptions = readCompilerOptions(path.join(apiRoot, 'tsconfig.json'))
    const tsconfigContent = JSON.stringify({
      compilerOptions: { ...baseCompilerOptions, ...apiCompilerOptions },
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
      cleanup: () => cleanup(hadRealEnv),
    }
  } catch (error) {
    cleanup(hadRealEnv)
    throw error
  }
}

function cleanup(hadRealEnv: boolean): void {
  rmSync(fixtureRoot, { recursive: true, force: true })
  rmSync(envPath, { force: true })
  if (hadRealEnv) {
    renameSync(envBackupPath, envPath)
  }
}
