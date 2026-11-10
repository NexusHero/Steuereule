#!/usr/bin/env node
// Applies the migrations of BOTH databases (ADR-0059): the tax-data database and the keystore.
// Every pipeline (CI jobs, compose `migrate`, the Cloud Run migrate job) runs this one script
// via `pnpm --filter @steuereule/api migrate:deploy`, so none of them can forget the keystore.
import { execFileSync } from 'node:child_process'
import { PrismaClient } from '@prisma/client'

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

const run = (args, env) => execFileSync('prisma', args, { stdio: 'inherit', env })

run(['migrate', 'deploy'], process.env)
const keystore = keystoreUrl(process.env)
if (keystore.derived || sameServer(keystore.url, process.env.DATABASE_URL)) await ensureDatabaseExists(keystore.url)
run(['migrate', 'deploy', '--schema', 'prisma/keystore/schema.prisma'], {
  ...process.env,
  KEYSTORE_DATABASE_URL: keystore.url,
})
