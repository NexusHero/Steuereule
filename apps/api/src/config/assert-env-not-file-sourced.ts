import { fileURLToPath } from 'node:url'
import { GUARDED_ENV_VAR_NAMES, type GuardedEnvVarName, namesPresentIn, PRESENT_BEFORE_PRISMA_COULD_LOAD } from './env-snapshot.js'

const LIKELY_SOURCE_ENV_FILE = fileURLToPath(new URL('../../.env', import.meta.url))

export function namesThatArrivedAfterPrismaCouldLoad(
  before: ReadonlySet<GuardedEnvVarName>,
  after: NodeJS.ProcessEnv,
): GuardedEnvVarName[] {
  return GUARDED_ENV_VAR_NAMES.filter((name) => !before.has(name) && namesPresentIn(after).has(name))
}

export function assertEnvNotFileSourced(
  env: NodeJS.ProcessEnv = process.env,
  before: ReadonlySet<GuardedEnvVarName> = PRESENT_BEFORE_PRISMA_COULD_LOAD,
): void {
  const arrived = namesThatArrivedAfterPrismaCouldLoad(before, env)
  if (arrived.length === 0) return
  if (env.NODE_ENV !== 'production') return

  throw new Error(
    `Refusing to start: ${arrived.join(', ')} ${arrived.length === 1 ? 'is' : 'are'} present in this ` +
      "process's environment now but were NOT set when it started — the signature of a value that " +
      `arrived from a file during startup, most likely ${LIKELY_SOURCE_ENV_FILE} if it exists on this ` +
      "machine (Prisma's generated client merges a schema-adjacent .env into process.env as an import " +
      'side effect; see #284). In production every value must come from the operator’s own ' +
      'configuration, never from a file that happened to be on disk at import time — set these ' +
      'explicitly in the environment, or remove the file.',
  )
}
