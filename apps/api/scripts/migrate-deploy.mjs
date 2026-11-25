#!/usr/bin/env node
// Applies the migrations of BOTH databases (ADR-0059): the tax-data database and the keystore.
// Every pipeline (CI jobs, compose `migrate`, the Cloud Run migrate job) runs this one script
// via `pnpm --filter @steuereule/api migrate:deploy`, so none of them can forget the keystore.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'
import { provisionRuntimeLogin, runtimeLoginPlan } from './runtime-database-login.mjs'

function keystoreUrl(env) {
  if (env.KEYSTORE_DATABASE_URL?.trim()) return { url: env.KEYSTORE_DATABASE_URL.trim(), derived: false }
  if (env.NODE_ENV === 'production') {
    throw new Error('KEYSTORE_DATABASE_URL must be set in production (ADR-0059).')
  }
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set.')
  const url = new URL(env.DATABASE_URL)
  url.pathname = `${url.pathname.replace(/\/$/, '') || '/steuereule'}_keystore`
  return { url: url.toString(), derived: true }
}

function sameServer(a, b) {
  if (!a || !b) return false
  const [x, y] = [new URL(a), new URL(b)]
  return x.hostname === y.hostname && (x.port || '5432') === (y.port || '5432')
}

// A keystore database on the tax-data server (dev/CI/E2E, the local prod stack) is created through the already reachable
// tax-data connection, so no pipeline needs an extra provisioning step for it.
async function ensureDatabaseExists(keystore) {
  const name = decodeURIComponent(new URL(keystore).pathname.slice(1))
  if (!/^[A-Za-z0-9_]+$/.test(name)) throw new Error(`Unexpected keystore database name "${name}".`)
  const client = new PrismaClient()
  try {
    const rows = await client.$queryRaw`SELECT 1 FROM pg_database WHERE datname = ${name}`
    if (rows.length === 0) await client.$executeRawUnsafe(`CREATE DATABASE "${name}"`)
  } finally {
    await client.$disconnect()
  }
}

// The Prisma CLI of this package, started with this Node: a bare `prisma` would be looked up in the
// caller's PATH, where a writable folder could put another program in its place (Sonar S4036).
const require = createRequire(import.meta.url)
const prismaPackage = require.resolve('prisma/package.json')
const prismaCli = path.join(path.dirname(prismaPackage), JSON.parse(readFileSync(prismaPackage, 'utf8')).bin.prisma)
const run = (args, env) => execFileSync(process.execPath, [prismaCli, ...args], { stdio: 'inherit', env })

// P11: this job connects as the migration login, the owner of the tables (`DATABASE_URL` of this job). The tables
// are FORCEd for row-level security, so the policies bind the owner too; a data migration or backfill under a
// non-superuser owner (Cloud SQL) would see no rows. This one job runs as the named system path `migration`
// (`app_rls.is_system()`). The API has another login, which this job creates below (`RUNTIME_DATABASE_URL`,
// scripts/runtime-database-login.mjs) and which owns nothing.
function asMigration(url) {
  if (!url) return url
  const parsed = new URL(url.trim())
  const option = '-c steuereule.system=migration'
  const existing = parsed.searchParams.get('options')
  if (existing === null) return `${url.trim()}${url.includes('?') ? '&' : '?'}options=${encodeURIComponent(option)}`
  parsed.searchParams.set('options', `${existing} ${option}`)
  return parsed.toString()
}
// Decided before anything is changed: a production run without a separate runtime login stops here.
const runtimeLogin = runtimeLoginPlan(process.env)
const migrationEnv = { ...process.env, DATABASE_URL: asMigration(process.env.DATABASE_URL) }

run(['migrate', 'deploy'], migrationEnv)
if (runtimeLogin.kind === 'provision') {
  const owner = new PrismaClient()
  try {
    await provisionRuntimeLogin(owner, runtimeLogin)
  } finally {
    await owner.$disconnect()
  }
}
const keystore = keystoreUrl(process.env)
if (keystore.derived || sameServer(keystore.url, process.env.DATABASE_URL)) await ensureDatabaseExists(keystore.url)
run(['migrate', 'deploy', '--schema', 'prisma/keystore/schema.prisma'], {
  ...process.env,
  KEYSTORE_DATABASE_URL: keystore.url,
})

// ADR-0107 H3: re-encrypt any Profile name rows still in cleartext at rest. Non-strict field
// encryption only encrypts on the next write, so pre-deployment rows need this one-time, idempotent
// backfill — run here so the rollout cannot forget it (same rationale as the keystore step above).
// Invoked through tsx because it reuses the app's own key resolver (TypeScript); the production image
// already boots with `node --import tsx` (ADR-0010a).
const backfillScript = path.join(path.dirname(fileURLToPath(import.meta.url)), 'backfill-profile-name-encryption.ts')
execFileSync(process.execPath, ['--import', 'tsx', backfillScript], { stdio: 'inherit', env: migrationEnv })

// ADR-0109: accounts are found by `emailHash` from this release on. Filling the hash here, before the release
// takes traffic, is what keeps existing accounts able to sign in; the addresses themselves stay plaintext
// until `backfill-identity.ts` is run without a phase after the release. Idempotent.
const identityBackfill = path.join(path.dirname(fileURLToPath(import.meta.url)), 'backfill-identity.ts')
execFileSync(process.execPath, ['--import', 'tsx', identityBackfill, '--phase=hash'], { stdio: 'inherit', env: migrationEnv })
