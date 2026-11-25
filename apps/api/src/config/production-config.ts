import { existsSync } from 'node:fs'
import { selfEmploymentEnabled } from './self-employment.js'
import { resolveTrustedProxies } from './trusted-proxies.js'

/**
 * The one declared list of the configuration a production run of the API needs (beta package P1).
 *
 * Every entry says where the value comes from, so a value that has no way to reach the runtime is visible
 * here and in CI: `test/config/deployment-wiring.test.ts` compares this list with `.github/workflows/deploy.yml`,
 * `infra/gcp/main.tf`, the Dockerfiles, `docker-compose.prod.yml` and `.env.example`.
 *
 * `assertProductionConfig` runs first thing at boot. Under `NODE_ENV=production` it refuses to start and names
 * every value that is missing, malformed, or still a known development value.
 */

/** Where a value comes from on a Cloud Run deployment. */
export type SettingSource =
  /** A Secret Manager secret (created empty by `infra/gcp/main.tf`), mounted by deploy.yml `--update-secrets`. */
  | 'secret-manager'
  /** A plain variable deploy.yml sets with `--update-env-vars`, derived from GitHub environment variables. */
  | 'deploy-env'
  /** Baked into the API image (`ENV` in apps/api/Dockerfile, a build arg where it depends on the commit). */
  | 'image'
  /** Injected by Cloud Run itself. */
  | 'cloud-run'

/**
 * - `always`: needed by every production run, also the local production-shaped compose stack.
 * - `deployment`: needed on a real deployment; the local stack on localhost may go without it.
 * - `optional`: a feature that is off while the value is unset.
 */
export type SettingNeed = 'always' | 'deployment' | 'optional'

export interface ProductionSetting {
  readonly name: string
  readonly source: SettingSource
  readonly need: SettingNeed
  /** Type and format, for the error message and the docs. */
  readonly format: string
  /** A problem with a value that is set, or undefined when it is fine. */
  readonly check?: (value: string, context: CheckContext) => string | undefined
  /** Secrets: values published in this repository (fallbacks, `.env.example`, CI) that must never run a deployment. */
  readonly secret?: boolean
  readonly knownDevValues?: readonly string[]
}

interface CheckContext {
  readonly deployment: boolean
  readonly env: NodeJS.ProcessEnv
}

/**
 * The development fallbacks of the resolvers (auth/better-auth-env.ts, auth/guest-session.ts,
 * keystore/keystore-config.ts, prisma/field-encryption-key.ts), written out here so this module stays free of
 * those modules. test/config/production-config.test.ts asks each resolver for its fallback and proves it is listed.
 */
const DEV_FIELD_KEY = 'k1.aesgcm256.MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY='
const DEV_HASH_SALT = 'dev-only-email-hash-salt'
const DEV_KEYSTORE_SECRET = 'steuereule-dev-only-keystore-master-key'
const DEV_GUEST_SESSION_SECRET = 'dev-only-insecure-guest-session-secret-do-not-use-in-production'
const DEV_BETTER_AUTH_SECRET = 'dev-only-insecure-better-auth-secret-do-not-use-in-production'
const DEV_GOOGLE_CLIENT_ID = 'dev-only-google-client-id'
const DEV_GOOGLE_CLIENT_SECRET = 'dev-only-google-client-secret'

const MIN_SECRET_LENGTH = 32
const FIELD_KEY_PATTERN = /^k1\.aesgcm256\.[A-Za-z0-9+/]{43}=$/

function minLength(value: string): string | undefined {
  return value.length >= MIN_SECRET_LENGTH ? undefined : `shorter than ${MIN_SECRET_LENGTH} characters`
}

function postgresUrl(value: string): string | undefined {
  return /^postgres(ql)?:\/\//.test(value) ? undefined : 'not a postgresql:// URL'
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

function webUrl(value: string, { deployment }: CheckContext): string | undefined {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return 'not a URL'
  }
  if (deployment && url.protocol !== 'https:') return 'must be an https:// URL on a deployment'
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'must be an http(s):// URL'
  return undefined
}

function originList(value: string, context: CheckContext): string | undefined {
  const entries = value.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0)
  if (entries.length === 0) return 'names no origin'
  for (const entry of entries) {
    if (entry === '*') return 'must not be "*"'
    const problem = webUrl(entry, context)
    if (problem) return `entry ${entry}: ${problem}`
    if (new URL(entry).origin !== entry.replace(/\/$/, '')) return `entry ${entry} is not a bare origin (scheme://host[:port])`
  }
  return undefined
}

function fieldKeys(value: string): string | undefined {
  const bad = value.split(',').map((key) => key.trim()).filter((key) => key.length > 0 && !FIELD_KEY_PATTERN.test(key))
  return bad.length === 0 ? undefined : 'not of the form k1.aesgcm256.<44 base64 characters> (`npx cloak generate`)'
}

/** One `@`, a local part, and a domain with a dot that is neither first nor last; no whitespace. Linear, no regex. */
export function isEmailAddress(value: string): boolean {
  const at = value.indexOf('@')
  if (at <= 0 || at !== value.lastIndexOf('@') || /\s/u.test(value)) return false
  const domain = value.slice(at + 1)
  const dot = domain.indexOf('.')
  return dot > 0 && !domain.endsWith('.')
}

function prefixed(...prefixes: string[]) {
  return (value: string): string | undefined =>
    prefixes.some((prefix) => value.startsWith(prefix)) ? undefined : `must start with ${prefixes.join(' or ')}`
}

export const API_PRODUCTION_SETTINGS: readonly ProductionSetting[] = [
  // ── Database and keys ──────────────────────────────────────────────────────────────────────
  { name: 'DATABASE_URL', source: 'secret-manager', need: 'always', format: 'postgresql:// URL', check: postgresUrl },
  { name: 'KEYSTORE_DATABASE_URL', source: 'secret-manager', need: 'always', format: 'postgresql:// URL of the keystore instance (ADR-0059)', check: postgresUrl },
  {
    name: 'PRISMA_FIELD_ENCRYPTION_KEY',
    source: 'secret-manager',
    need: 'always',
    format: 'k1.aesgcm256.<base64 of 32 bytes>',
    check: fieldKeys,
    secret: true,
    knownDevValues: [DEV_FIELD_KEY],
  },
  { name: 'PRISMA_FIELD_DECRYPTION_KEYS', source: 'secret-manager', need: 'optional', format: 'comma-separated earlier field keys (rotation)', check: fieldKeys, secret: true, knownDevValues: [DEV_FIELD_KEY] },
  {
    name: 'PRISMA_FIELD_ENCRYPTION_HASH_SALT',
    source: 'secret-manager',
    need: 'always',
    format: `random string, at least ${MIN_SECRET_LENGTH} characters; never changes once accounts exist`,
    check: minLength,
    secret: true,
    knownDevValues: [DEV_HASH_SALT],
  },
  { name: 'KEYSTORE_MASTER_KEY', source: 'secret-manager', need: 'always', format: `random string, at least ${MIN_SECRET_LENGTH} characters`, check: minLength, secret: true, knownDevValues: [DEV_KEYSTORE_SECRET] },
  { name: 'KEYSTORE_MASTER_KEY_PREVIOUS', source: 'secret-manager', need: 'optional', format: 'comma-separated earlier master keys (rotation)', secret: true, knownDevValues: [DEV_KEYSTORE_SECRET] },
  { name: 'GUEST_SESSION_SECRET', source: 'secret-manager', need: 'always', format: `random string, at least ${MIN_SECRET_LENGTH} characters`, check: minLength, secret: true, knownDevValues: [DEV_GUEST_SESSION_SECRET] },
  { name: 'BETTER_AUTH_SECRET', source: 'secret-manager', need: 'always', format: `random string, at least ${MIN_SECRET_LENGTH} characters`, check: minLength, secret: true, knownDevValues: [DEV_BETTER_AUTH_SECRET] },

  // ── Origins and network ────────────────────────────────────────────────────────────────────
  { name: 'BETTER_AUTH_URL', source: 'deploy-env', need: 'always', format: 'https URL of the API (https://api.<APP_DOMAIN>)', check: webUrl },
  { name: 'WEB_APP_URL', source: 'deploy-env', need: 'always', format: 'https URL of the web app (https://www.<APP_DOMAIN>)', check: webUrl },
  { name: 'CORS_ALLOWED_ORIGINS', source: 'deploy-env', need: 'always', format: 'comma-separated origins of the web app', check: originList },
  {
    name: 'TRUSTED_PROXIES',
    source: 'deploy-env',
    need: 'always',
    format: 'comma-separated IPs/CIDRs of the proxies in front of the API, or "none" (Cloud Run direct ingress: 169.254.0.0/16)',
    check: (value) => {
      try {
        resolveTrustedProxies({ TRUSTED_PROXIES: value })
        return undefined
      } catch (error) {
        return error instanceof Error ? error.message : String(error)
      }
    },
  },
  { name: 'PORT', source: 'cloud-run', need: 'optional', format: 'TCP port', check: (value) => (/^\d{1,5}$/.test(value) && Number(value) > 0 && Number(value) < 65536 ? undefined : 'not a TCP port') },

  // ── E-mail ─────────────────────────────────────────────────────────────────────────────────
  { name: 'BREVO_API_KEY', source: 'secret-manager', need: 'deployment', format: 'Brevo API key', secret: true },
  { name: 'EMAIL_FROM', source: 'deploy-env', need: 'deployment', format: 'sender address on the authenticated Brevo domain', check: (value) => (isEmailAddress(value) ? undefined : 'not an e-mail address') },

  // ── Payment (ADR-0101): all or nothing; required on a deployment, so the last step never dead-ends ──
  { name: 'STRIPE_SECRET_KEY', source: 'secret-manager', need: 'deployment', format: 'sk_test_… / sk_live_… (or a restricted rk_ key)', check: prefixed('sk_test_', 'sk_live_', 'rk_test_', 'rk_live_'), secret: true },
  { name: 'STRIPE_WEBHOOK_SECRET', source: 'secret-manager', need: 'deployment', format: 'whsec_… of the webhook endpoint', check: prefixed('whsec_'), secret: true },
  { name: 'STRIPE_PRICE_ID', source: 'secret-manager', need: 'deployment', format: 'price_… of the standard printout', check: prefixed('price_') },
  { name: 'STRIPE_PRICE_ID_SELBSTSTAENDIG', source: 'secret-manager', need: 'optional', format: 'price_… of the self-employment tier; required while SELBSTSTAENDIGE_ENABLED is on', check: prefixed('price_') },

  // ── Login providers ────────────────────────────────────────────────────────────────────────
  { name: 'GOOGLE_CLIENT_ID', source: 'secret-manager', need: 'optional', format: 'OAuth client id (*.apps.googleusercontent.com)', secret: true, knownDevValues: [DEV_GOOGLE_CLIENT_ID] },
  { name: 'GOOGLE_CLIENT_SECRET', source: 'secret-manager', need: 'optional', format: 'OAuth client secret', secret: true, knownDevValues: [DEV_GOOGLE_CLIENT_SECRET] },

  // ── Shared state (OPS-7): without Redis every limit counts per instance ────────────────────
  {
    name: 'REDIS_URL',
    source: 'secret-manager',
    need: 'deployment',
    format: 'rediss:// URL (redis:// only on the local stack)',
    check: (value, { deployment }) => {
      if (deployment) return value.startsWith('rediss://') ? undefined : 'must be a rediss:// (TLS) URL on a deployment'
      return /^rediss?:\/\//.test(value) ? undefined : 'not a redis:// or rediss:// URL'
    },
  },
  { name: 'REDIS_TLS_CA', source: 'secret-manager', need: 'optional', format: 'PEM of the Redis server CA', check: (value) => (value.includes('-----BEGIN CERTIFICATE-----') ? undefined : 'not a PEM certificate') },

  // ── Model providers (ADR-0064): the owl answers from the rules until one key is set ────────
  { name: 'GEMINI_API_KEY', source: 'secret-manager', need: 'optional', format: 'provider API key', secret: true },
  { name: 'ANTHROPIC_API_KEY', source: 'secret-manager', need: 'optional', format: 'provider API key', secret: true },
  { name: 'OPENAI_API_KEY', source: 'secret-manager', need: 'optional', format: 'provider API key', secret: true },

  // ── Image ──────────────────────────────────────────────────────────────────────────────────
  { name: 'NODE_ENV', source: 'image', need: 'always', format: '"production"' },
  { name: 'APP_VERSION', source: 'image', need: 'deployment', format: 'commit the image was built from (build arg APP_VERSION)' },
  {
    name: 'STREET_DATA_PATH',
    source: 'image',
    need: 'deployment',
    format: 'path of the street CSV baked into the image (ADR-0065)',
    check: (value) => (existsSync(value) ? undefined : `file ${value} does not exist`),
  },
]

/** The GitHub environment variables deploy.yml reads. Each must be set in the environment it deploys to. */
export interface DeployVariable {
  readonly name: string
  readonly need: 'required' | 'optional'
  readonly purpose: string
}

export const DEPLOY_VARIABLES: readonly DeployVariable[] = [
  { name: 'GCP_ENVIRONMENT', need: 'required', purpose: 'marker, equal to the GitHub environment name (staging or production)' },
  { name: 'GCP_PROJECT_ID', need: 'required', purpose: 'GCP project of this environment' },
  { name: 'GCP_REGION', need: 'required', purpose: 'region of Cloud Run, Cloud SQL and the registry (europe-west4)' },
  { name: 'GCP_WIF_PROVIDER', need: 'required', purpose: 'OpenTofu output workload_identity_provider' },
  { name: 'GCP_DEPLOYER_SA', need: 'required', purpose: 'OpenTofu output deployer_service_account' },
  { name: 'GCP_RUNTIME_SA', need: 'required', purpose: 'OpenTofu output api_runtime_service_account' },
  { name: 'GCP_WEB_SA', need: 'required', purpose: 'OpenTofu output web_runtime_service_account' },
  { name: 'GCP_SQL_INSTANCE', need: 'required', purpose: 'OpenTofu output sql_connection_name' },
  { name: 'GCP_KEYSTORE_SQL_INSTANCE', need: 'required', purpose: 'OpenTofu output keystore_sql_connection_name' },
  { name: 'GCP_VPC_NETWORK', need: 'required', purpose: 'OpenTofu output vpc_network' },
  { name: 'GCP_VPC_SUBNET', need: 'required', purpose: 'OpenTofu output vpc_subnet' },
  { name: 'APP_DOMAIN', need: 'required', purpose: 'domain without www; web on www., API on api.' },
  { name: 'EMAIL_FROM', need: 'required', purpose: 'sender address (EMAIL_FROM of the API)' },
  { name: 'TRUSTED_PROXIES', need: 'required', purpose: 'TRUSTED_PROXIES of the API; 169.254.0.0/16 for Cloud Run direct ingress' },
  { name: 'EXPO_PUBLIC_BETREIBER_NAME', need: 'required', purpose: 'operator name in the Impressum (§ 5 DDG)' },
  { name: 'EXPO_PUBLIC_BETREIBER_ANSCHRIFT', need: 'required', purpose: 'operator postal address, line breaks as \\n' },
  { name: 'EXPO_PUBLIC_BETREIBER_EMAIL', need: 'required', purpose: 'operator e-mail address' },
  { name: 'EXPO_PUBLIC_BETREIBER_VERTRETEN', need: 'optional', purpose: 'represented by (companies only)' },
  { name: 'EXPO_PUBLIC_BETREIBER_USTID', need: 'optional', purpose: 'VAT id, if any' },
]

/** Build args of apps/mobile-web/Dockerfile: Expo inlines EXPO_PUBLIC_* into the bundle at `expo export`. */
export const WEB_BUILD_ARGS: readonly string[] = [
  'EXPO_PUBLIC_API_BASE_URL',
  'EXPO_PUBLIC_BETREIBER_NAME',
  'EXPO_PUBLIC_BETREIBER_ANSCHRIFT',
  'EXPO_PUBLIC_BETREIBER_EMAIL',
  'EXPO_PUBLIC_BETREIBER_VERTRETEN',
  'EXPO_PUBLIC_BETREIBER_USTID',
]

/** The values NODE_ENV may take. Anything else (prod, staging) would silently run with the dev fallbacks (OPS-9). */
export const ALLOWED_NODE_ENVS = ['production', 'development', 'test'] as const

/** Words that mark a value as written for development, CI or an example, never generated for a deployment. */
const DEV_MARKER = /(^|[-_.])(dev-only|change-me|local-only|local-stack-only|local-prod-test|ci|unit-test|example|placeholder)([-_.]|$)/i

export function isKnownDevValue(setting: ProductionSetting, value: string): boolean {
  if (setting.knownDevValues?.includes(value)) return true
  if (setting.knownDevValues?.some((known) => value.split(',').map((part) => part.trim()).includes(known))) return true
  return setting.secret === true && DEV_MARKER.test(value)
}

function isLoopbackUrl(value: string | undefined): boolean {
  if (!value) return false
  try {
    return isLoopbackHost(new URL(value).hostname)
  } catch {
    return false
  }
}

/**
 * The local production-shaped compose stack (ADR-0026) runs `NODE_ENV=production` on localhost with synthetic
 * values. It counts as local only when the API is not on Cloud Run (`K_SERVICE` unset) and every origin it
 * serves is a loopback address: nothing beyond the machine can reach it, so a published key protects nothing
 * that matters. Any public origin makes the run a deployment, with every check below.
 */
export function isLocalProductionStack(env: NodeJS.ProcessEnv): boolean {
  if (env.K_SERVICE) return false
  const origins = [env.BETTER_AUTH_URL, env.WEB_APP_URL, ...(env.CORS_ALLOWED_ORIGINS ?? '').split(',').map((entry) => entry.trim()).filter(Boolean)]
  return origins.every(isLoopbackUrl)
}

export interface ConfigReport {
  readonly deployment: boolean
  readonly problems: readonly string[]
  readonly warnings: readonly string[]
}

const SOURCE_HINT: Record<SettingSource, string> = {
  'secret-manager': 'Secret Manager secret, scripts/infra/gcp-setup.sh',
  'deploy-env': 'set by .github/workflows/deploy.yml from the GitHub environment variables',
  image: 'apps/api/Dockerfile',
  'cloud-run': 'Cloud Run',
}

function readSetting(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const raw = env[name]?.trim()
  return raw && raw.length > 0 ? raw : undefined
}

export function checkProductionConfig(env: NodeJS.ProcessEnv = process.env): ConfigReport {
  const problems: string[] = []
  const warnings: string[] = []
  const nodeEnv = readSetting(env, 'NODE_ENV')
  if (nodeEnv !== undefined && !(ALLOWED_NODE_ENVS as readonly string[]).includes(nodeEnv)) {
    problems.push(`NODE_ENV: "${nodeEnv}" is not one of ${ALLOWED_NODE_ENVS.join(', ')} — any other name would run with the development fallbacks`)
  }
  if (nodeEnv !== 'production') return { deployment: false, problems, warnings }

  const deployment = !isLocalProductionStack(env)
  const context: CheckContext = { deployment, env }
  for (const setting of API_PRODUCTION_SETTINGS) {
    const current = readSetting(env, setting.name)
    if (current === undefined) {
      if (setting.need === 'always' || (setting.need === 'deployment' && deployment)) {
        problems.push(`${setting.name}: not set (${setting.format}; from: ${SOURCE_HINT[setting.source]})`)
      }
      continue
    }
    const problem = setting.check?.(current, context)
    if (problem) problems.push(`${setting.name}: ${problem} (${setting.format})`)
    if (isKnownDevValue(setting, current)) {
      if (deployment) problems.push(`${setting.name}: still a development value published in this repository — generate a real one`)
      else warnings.push(setting.name)
    }
  }

  // All or nothing, also on the local stack: a partial Stripe setup would fail at the first checkout.
  const stripe = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_ID']
  const stripeSet = stripe.filter((name) => readSetting(env, name) !== undefined)
  if (!deployment && stripeSet.length > 0 && stripeSet.length < stripe.length) {
    problems.push(`${stripe.filter((name) => !stripeSet.includes(name)).join(', ')}: not set, but ${stripeSet.join(', ')} is — Stripe needs all three`)
  }
  if (stripeSet.length > 0 && selfEmploymentEnabled(env) && readSetting(env, 'STRIPE_PRICE_ID_SELBSTSTAENDIG') === undefined) {
    problems.push('STRIPE_PRICE_ID_SELBSTSTAENDIG: not set while SELBSTSTAENDIGE_ENABLED is on — the self-employment tier could not be sold')
  }
  const google = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'].filter((name) => readSetting(env, name) !== undefined)
  if (google.length === 1) problems.push(`GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET: only ${google[0]} is set — Google login needs both`)

  return { deployment, problems, warnings }
}

/** Boot guard: throws naming every problem; on the local stack it only warns about the synthetic values. */
export function assertProductionConfig(env: NodeJS.ProcessEnv = process.env, warn: (message: string) => void = console.warn): void {
  const report = checkProductionConfig(env)
  if (report.problems.length > 0) {
    throw new Error(`Refusing to start: the production configuration is incomplete.\n${report.problems.map((problem) => `  - ${problem}`).join('\n')}`)
  }
  if (report.warnings.length > 0) {
    warn(
      `Local production-shaped stack (every origin is localhost): running with the development values of ${report.warnings.join(', ')}. ` +
        'A deployment with any public origin refuses to start with them.',
    )
  }
}
