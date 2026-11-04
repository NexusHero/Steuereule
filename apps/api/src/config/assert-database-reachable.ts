import { PrismaClient } from '@prisma/client'
import { resolveDatabaseUrl } from './database-url.js'

const PROBE_TIMEOUT_MS = 5_000

export function describeDatabaseTarget(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl)
    const port = url.port || '5432'
    return `${url.hostname}:${port}`
  } catch {
    return 'the configured database (DATABASE_URL is not a parseable connection URL)'
  }
}

/** Identifies `withTimeout`'s own timeout rejection, and only that. */
export class ProbeTimeoutError extends Error {}

export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new ProbeTimeoutError(`timed out after ${ms}ms`)), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer)
  }
}

export function redactCause(rawCause: unknown): Error {
  if (!(rawCause instanceof Error)) return new Error('unknown error')
  if (rawCause instanceof ProbeTimeoutError) return rawCause
  return new Error(rawCause.constructor.name)
}

export async function disconnectQuietly(client: Pick<PrismaClient, '$disconnect'>): Promise<void> {
  await client.$disconnect().catch(() => {})
}

export async function assertDatabaseReachable(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const databaseUrl = resolveDatabaseUrl(env)
  const target = describeDatabaseTarget(databaseUrl)

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, PROBE_TIMEOUT_MS)
  } catch (rawCause) {
    // oxlint-disable-next-line eslint/preserve-caught-error
    throw new Error(
      `Cannot reach the database at ${target} within ${PROBE_TIMEOUT_MS}ms — refusing to start. ` +
        'This process fails fast and does not retry (12-Factor IX); fix connectivity or the ' +
        'startup order at the orchestrator (e.g. a depends_on: service_healthy dependency on the ' +
        'database container), not by waiting on this one.',
      { cause: redactCause(rawCause) },
    )
  } finally {
    await disconnectQuietly(prisma)
  }
}
