import process from 'node:process'

export const GUARDED_ENV_VAR_NAMES = [
  'DATABASE_URL',
  'GUEST_SESSION_SECRET',
  'PRISMA_FIELD_ENCRYPTION_KEY',
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_URL',
  'CORS_ALLOWED_ORIGINS',
  'PORT',
] as const

export type GuardedEnvVarName = (typeof GUARDED_ENV_VAR_NAMES)[number]

export function namesPresentIn(env: NodeJS.ProcessEnv): ReadonlySet<GuardedEnvVarName> {
  return new Set(GUARDED_ENV_VAR_NAMES.filter((name) => env[name] !== undefined))
}

export const PRESENT_BEFORE_PRISMA_COULD_LOAD: ReadonlySet<GuardedEnvVarName> = namesPresentIn(process.env)
