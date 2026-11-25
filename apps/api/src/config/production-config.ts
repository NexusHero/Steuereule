import { existsSync, statSync } from 'node:fs'
import { selfEmploymentEnabled } from './self-employment.js'
import { resolveTrustedProxies } from './trusted-proxies.js'

/**
 * The one declared list of the configuration a production run of the API needs (beta package P1).
 *
 * Every entry says where the value comes from, so a value that has no way to reach the runtime is visible
 * here and in CI: `test/config/deployment-wiring.test.ts` compares this list with `.github/workflows/deploy.yml`,
 * `infra/gcp/main.tf`, the Dockerfiles, `docker-compose.prod.yml`, `.env.example` and `infra/README.md`.
 *
 * The list is complete: `test/config/environment-reads.test.ts` parses every source file of the API and fails
 * for an environment variable that is read but neither declared here nor named in `NON_PRODUCTION_VARIABLES`,
 * and for a declared one that nothing reads.
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
   * Set by hand on the service (`gcloud run services update steuereule-api --update-env-vars NAME=value`).
   * The deploy merges, so the value survives it (OPS-12). Every one has a default in code; infra/README.md lists them.
   */
  | 'operator'

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

function prefixed(...prefixes: string[]) {
  return (value: string): string | undefined =>
    prefixes.some((prefix) => value.startsWith(prefix)) ? undefined : `must start with ${prefixes.join(' or ')}`
}

/** A whole number within the bounds the reading code accepts; it would clamp or ignore anything else without a word. */
function wholeNumber(min: number, max: number = Number.MAX_SAFE_INTEGER) {
  return (value: string): string | undefined => {
    const inRange = /^\d+$/.test(value) && Number(value) >= min && Number(value) <= max
    if (inRange) return undefined
    return max === Number.MAX_SAFE_INTEGER ? `not a whole number of at least ${min}` : `not a whole number from ${min} to ${max}`
  }
}

function oneOf(...allowed: string[]) {
  return (value: string): string | undefined => (allowed.includes(value.toLowerCase()) ? undefined : `must be one of ${allowed.join(', ')}`)
}

const SWITCH_WORDS = ['true', '1', 'yes', 'on', 'false', '0', 'no', 'off']
/** An on/off switch. The readers treat every word they do not know as the default, so a typo would go unnoticed. */
const onOff = oneOf(...SWITCH_WORDS)

function isOn(value: string | undefined): boolean {
  return value !== undefined && ['true', '1', 'yes', 'on'].includes(value.toLowerCase())
}

function httpsUrl(value: string): string | undefined {
  try {
    return new URL(value).protocol === 'https:' ? undefined : 'must be an https:// URL'
  } catch {
    return 'not a URL'
  }
}

function existingFile(value: string): string | undefined {
  return existsSync(value) && statSync(value).isFile() ? undefined : `file ${value} does not exist`
}

function existingDirectory(value: string): string | undefined {
  return existsSync(value) && statSync(value).isDirectory() ? undefined : `directory ${value} does not exist`
}

/** A key copied from documentation is cut short with dots; a real one has no blanks and no ellipsis. */
function providerKey(value: string): string | undefined {
  if (/\s/.test(value)) return 'contains white space'
  return /(\.\.\.|…)$/.test(value) ? 'ends in an ellipsis: a placeholder from the documentation, not a key' : undefined
}

function modelId(value: string): string | undefined {
  return /^\S+$/.test(value) ? undefined : 'contains white space'
}

/** The placeholders `.env.example` shows for the model keys. */
const EXAMPLE_PROVIDER_KEYS = ['sk-ant-...', 'AIzaSy...']
const AI_PROVIDERS = ['google-genai', 'anthropic', 'openai', 'deterministic']
const aiProvider = oneOf(...AI_PROVIDERS)

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
  { name: 'EMAIL_FROM', source: 'deploy-env', need: 'deployment', format: 'sender address on the authenticated Brevo domain', check: (value) => (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) ? undefined : 'not an e-mail address') },

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

  // ── Login providers: Apple (REQ-008) stays off until the switch is on and both values are set ─────────
  { name: 'APPLE_SIGN_IN_ENABLED', source: 'operator', need: 'optional', format: '"true" switches Apple sign-in on (default off); needs APPLE_CLIENT_ID and APPLE_CLIENT_SECRET', check: (value) => (value === 'true' || value === 'false' ? undefined : 'must be true or false') },
  { name: 'APPLE_CLIENT_ID', source: 'secret-manager', need: 'optional', format: 'Apple Services ID' },
  { name: 'APPLE_CLIENT_SECRET', source: 'secret-manager', need: 'optional', format: 'client secret (JWT) signed with the Apple key', secret: true },

  // ── E-mail delivery of the local stack: Mailpit over SMTP instead of Brevo ─────────────────
  {
    name: 'EMAIL_DELIVERY',
    source: 'operator',
    need: 'optional',
    format: '"smtp" sends through SMTP_URL; unset sends through Brevo',
    check: (value) => {
      if (value === 'log') return '"log" would write verification and reset links to the log; refused in production'
      return value === 'smtp' ? undefined : 'must be "smtp" or unset'
    },
  },
  { name: 'SMTP_URL', source: 'operator', need: 'optional', format: 'smtp:// or smtps:// URL; required while EMAIL_DELIVERY is smtp', check: (value) => (/^smtps?:\/\/\S+$/.test(value) ? undefined : 'not an smtp:// or smtps:// URL') },
  { name: 'EMAIL_FROM_NAME', source: 'operator', need: 'optional', format: 'sender name (default "SteuerEule")' },

  // ── Model providers (ADR-0064): the owl answers from the rules until one key is set ────────
  { name: 'GEMINI_API_KEY', source: 'secret-manager', need: 'optional', format: 'provider API key', check: providerKey, secret: true, knownDevValues: EXAMPLE_PROVIDER_KEYS },
  { name: 'GOOGLE_API_KEY', source: 'secret-manager', need: 'optional', format: 'provider API key, read when GEMINI_API_KEY is unset', check: providerKey, secret: true, knownDevValues: EXAMPLE_PROVIDER_KEYS },
  { name: 'ANTHROPIC_API_KEY', source: 'secret-manager', need: 'optional', format: 'provider API key', check: providerKey, secret: true, knownDevValues: EXAMPLE_PROVIDER_KEYS },
  { name: 'OPENAI_API_KEY', source: 'secret-manager', need: 'optional', format: 'provider API key', check: providerKey, secret: true, knownDevValues: EXAMPLE_PROVIDER_KEYS },
  { name: 'AI_API_KEY', source: 'secret-manager', need: 'optional', format: 'API key for the chosen provider when it has none of its own; needs AI_ADVISOR_PROVIDER', check: providerKey, secret: true, knownDevValues: EXAMPLE_PROVIDER_KEYS },

  // ── Model slots: chat, document reading, fallback, topic guard. Each takes its own provider, model and key;
  //    without them it uses AI_ADVISOR_PROVIDER, the provider's default model and the provider's key. ────
  { name: 'AI_ADVISOR_PROVIDER', source: 'operator', need: 'optional', format: `one of ${AI_PROVIDERS.join(', ')} (default: the provider that has a key)`, check: aiProvider },
  { name: 'AI_ADVISOR_MODEL', source: 'operator', need: 'optional', format: 'model id of the chat (default: the provider default)', check: modelId },
  { name: 'AI_ADVISOR_API_KEY', source: 'secret-manager', need: 'optional', format: 'API key of the chat slot', check: providerKey, secret: true, knownDevValues: EXAMPLE_PROVIDER_KEYS },
  { name: 'AI_VISION_PROVIDER', source: 'operator', need: 'optional', format: `one of ${AI_PROVIDERS.join(', ')} (default: AI_ADVISOR_PROVIDER)`, check: aiProvider },
  { name: 'AI_VISION_MODEL', source: 'operator', need: 'optional', format: 'model id for reading documents (default: the provider default)', check: modelId },
  { name: 'AI_VISION_API_KEY', source: 'secret-manager', need: 'optional', format: 'API key of the document slot', check: providerKey, secret: true, knownDevValues: EXAMPLE_PROVIDER_KEYS },
  { name: 'AI_FALLBACK_PROVIDER', source: 'operator', need: 'optional', format: `one of ${AI_PROVIDERS.join(', ')} (default: AI_ADVISOR_PROVIDER)`, check: aiProvider },
  { name: 'AI_FALLBACK_MODEL', source: 'operator', need: 'optional', format: 'model id of the fallback (default: the provider default)', check: modelId },
  { name: 'AI_FALLBACK_API_KEY', source: 'secret-manager', need: 'optional', format: 'API key of the fallback slot', check: providerKey, secret: true, knownDevValues: EXAMPLE_PROVIDER_KEYS },
  { name: 'AI_GUARD_PROVIDER', source: 'operator', need: 'optional', format: `one of ${AI_PROVIDERS.join(', ')} (default: AI_ADVISOR_PROVIDER)`, check: aiProvider },
  { name: 'AI_GUARD_MODEL', source: 'operator', need: 'optional', format: "model id of the topic guard (default: the provider's small model)", check: modelId },
  { name: 'AI_GUARD_API_KEY', source: 'secret-manager', need: 'optional', format: 'API key of the topic guard slot', check: providerKey, secret: true, knownDevValues: EXAMPLE_PROVIDER_KEYS },
  { name: 'AI_BASE_URL', source: 'operator', need: 'optional', format: 'https URL of an OpenAI-compatible endpoint (default: the provider endpoint)', check: httpsUrl },
  { name: 'OPENAI_BASE_URL', source: 'operator', need: 'optional', format: 'https URL, read when AI_BASE_URL is unset', check: httpsUrl },

  // ── Model behaviour and cost limits (ADR-0109) ─────────────────────────────────────────────
  { name: 'AI_KILL_SWITCH', source: 'operator', need: 'optional', format: 'on/off switch: on answers every model slot from the rules (default off)', check: onOff },
  { name: 'AI_DAILY_CALL_LIMIT', source: 'operator', need: 'optional', format: 'model calls a day across all users', check: wholeNumber(1, 100_000_000) },
  { name: 'AI_PAID_RESERVE_PERCENT', source: 'operator', need: 'optional', format: 'share of the daily calls kept for paid accounts, 0 to 90; 0 switches the reserve off', check: wholeNumber(0, 90) },
  { name: 'AI_DAILY_MESSAGE_LIMIT', source: 'operator', need: 'optional', format: 'chat messages a day per account', check: wholeNumber(1, 1_000) },
  { name: 'AI_TURN_TIMEOUT_MS', source: 'operator', need: 'optional', format: 'time limit of one answer in ms', check: wholeNumber(1, 120_000) },
  { name: 'AI_MAX_TOOL_ROUNDS', source: 'operator', need: 'optional', format: 'tool rounds per answer', check: wholeNumber(1, 10) },
  { name: 'AI_GUARD_TIMEOUT_MS', source: 'operator', need: 'optional', format: 'time limit of the topic guard in ms', check: wholeNumber(1, 20_000) },
  {
    name: 'AI_TEMPERATURE',
    source: 'operator',
    need: 'optional',
    format: 'sampling temperature, 0 to 2 (default: the provider default)',
    check: (value) => (/^\d+(\.\d+)?$/.test(value) && Number(value) <= 2 ? undefined : 'not a number from 0 to 2'),
  },
  { name: 'AI_ADVISOR_REASONING', source: 'operator', need: 'optional', format: '"off" hides the line of thought, "summary" shows it (default summary)', check: oneOf('off', 'summary') },
  { name: 'AI_ADVISOR_REASONING_BUDGET', source: 'operator', need: 'optional', format: 'token budget of the line of thought', check: wholeNumber(1, 16_000) },
  { name: 'AI_ADVISOR_THINKING_LEVEL', source: 'operator', need: 'optional', format: 'low, medium, high or auto (default medium)', check: oneOf('low', 'medium', 'high', 'auto') },

  // ── Upload and parse limits (ADR-0109) ─────────────────────────────────────────────────────
  { name: 'PARSE_DAILY_LIMIT', source: 'operator', need: 'optional', format: 'documents an account may have read per day', check: wholeNumber(1) },
  { name: 'UPLOAD_MAX_IN_FLIGHT', source: 'operator', need: 'optional', format: 'uploads an instance takes at once', check: wholeNumber(1) },
  { name: 'GUEST_UPLOAD_BYTES_PER_DAY', source: 'operator', need: 'optional', format: 'bytes a guest address may upload per day', check: wholeNumber(1) },
  { name: 'GUEST_UPLOAD_BYTES_PER_DAY_TOTAL', source: 'operator', need: 'optional', format: 'bytes all guests together may upload per day', check: wholeNumber(1) },

  // ── Self-employment (ADR-0101) ─────────────────────────────────────────────────────────────
  { name: 'SELBSTSTAENDIGE_ENABLED', source: 'operator', need: 'optional', format: 'on/off switch of the self-employment path (default on)', check: oneOf(...SWITCH_WORDS, 'ja', 'nein') },
  { name: 'ELSTER_SUPPLIED_LINES_DIR', source: 'operator', need: 'optional', format: 'directory of the Anlage S/G line files (default: the files in the image)', check: existingDirectory },
  { name: 'ELSTER_TRANSMISSION_ENABLED', source: 'operator', need: 'optional', format: 'on/off switch of the E-Bilanz transmission (default off); on needs the four ELSTER values below', check: onOff },
  { name: 'ELSTER_ERIC_CLI', source: 'operator', need: 'optional', format: 'path of the ERiC sidecar executable', check: existingFile },
  { name: 'ELSTER_CERT_PATH', source: 'operator', need: 'optional', format: "path of the operator's ELSTER certificate", check: existingFile },
  { name: 'ELSTER_CERT_PIN', source: 'secret-manager', need: 'optional', format: 'PIN of the ELSTER certificate', secret: true },
  { name: 'ELSTER_HERSTELLER_ID', source: 'operator', need: 'optional', format: 'Hersteller-ID of the ELSTER registration' },

  // ── Device list (ADR-0024): the region stays unknown until a geo-IP file is mounted (OPS-15) ──
  {
    name: 'GEOIP_DATABASE_PATH',
    source: 'operator',
    need: 'optional',
    format: 'path of the geo-IP CSV; its manifest lies next to it as <path>.manifest.json',
    check: (value) => existingFile(value) ?? existingFile(`${value}.manifest.json`),
  },

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

/**
 * Environment variables the API reads that are not production configuration. `production` says what a
 * production run does with one: `refused` names it as a problem when it is switched on, `ignored` reads it
 * without it being a setting anyone chooses.
 */
export interface NonProductionVariable {
  readonly name: string
  readonly production: 'refused' | 'ignored'
  readonly reason: string
}

export const NON_PRODUCTION_VARIABLES: readonly NonProductionVariable[] = [
  { name: 'K_SERVICE', production: 'ignored', reason: 'set by Cloud Run to the service name; tells a deployment from the local stack and names the service in error reports' },
  { name: 'PATH', production: 'ignored', reason: 'of the operating system; handed to the ERiC sidecar process, which gets nothing else of the environment' },
  { name: 'VITEST', production: 'ignored', reason: 'set by the test runner; keeps main.ts from starting a server and guards the test-fixture database identity' },
  { name: 'AI_FAKE_KI', production: 'refused', reason: 'the scripted chat model of CI and tests; it must never answer a real user (#450 D8)' },
  { name: 'PAYMENT_FAKE_PROVIDER', production: 'refused', reason: 'the payment provider of CI and tests; it would unlock the printout without payment (#450 D7)' },
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
  operator: 'gcloud run services update steuereule-api --update-env-vars, infra/README.md',
}

function readSetting(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const raw = env[name]?.trim()
  return raw && raw.length > 0 ? raw : undefined
}

/** Reads one known variable; a name that is in neither table is a mistake in this module. */
type KnownValue = (name: string) => string | undefined

/**
 * The value of every declared and every non-production variable, read once. The checks below ask this
 * snapshot, never the environment, so they cannot depend on a name that is in neither table.
 */
function readKnownValues(env: NodeJS.ProcessEnv): KnownValue {
  const names = [...API_PRODUCTION_SETTINGS, ...NON_PRODUCTION_VARIABLES].map((entry) => entry.name)
  const values = new Map<string, string | undefined>()
  for (const name of names) values.set(name, readSetting(env, name))
  return (name) => {
    if (!values.has(name)) throw new Error(`${name} is neither in API_PRODUCTION_SETTINGS nor in NON_PRODUCTION_VARIABLES`)
    return values.get(name)
  }
}

const AI_PROVIDER_KEYS: Readonly<Record<string, readonly string[]>> = {
  'google-genai': ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  anthropic: ['ANTHROPIC_API_KEY'],
  openai: ['OPENAI_API_KEY'],
}

const AI_SLOTS = [
  { title: 'chat', provider: 'AI_ADVISOR_PROVIDER', model: 'AI_ADVISOR_MODEL', key: 'AI_ADVISOR_API_KEY' },
  { title: 'document', provider: 'AI_VISION_PROVIDER', model: 'AI_VISION_MODEL', key: 'AI_VISION_API_KEY' },
  { title: 'fallback', provider: 'AI_FALLBACK_PROVIDER', model: 'AI_FALLBACK_MODEL', key: 'AI_FALLBACK_API_KEY' },
  { title: 'topic guard', provider: 'AI_GUARD_PROVIDER', model: 'AI_GUARD_MODEL', key: 'AI_GUARD_API_KEY' },
] as const

/**
 * A model slot works with a provider and a key that reaches it (ki/ai-runtime-config.service.ts); the model
 * has a default. Anything else leaves the slot answering from the rules without a word: a key no provider
 * uses, or a provider or model chosen for a slot no key reaches.
 */
function modelSlotProblems(value: KnownValue): string[] {
  const problems: string[] = []
  const provider = (name: string): string | undefined => {
    const chosen = value(name)?.toLowerCase()
    return chosen !== undefined && AI_PROVIDERS.includes(chosen) ? chosen : undefined
  }
  const withOwnKey = Object.keys(AI_PROVIDER_KEYS).find((candidate) => (AI_PROVIDER_KEYS[candidate] ?? []).some((key) => value(key) !== undefined))
  const standard = provider('AI_ADVISOR_PROVIDER')
  if (value('AI_API_KEY') !== undefined && standard === undefined && withOwnKey === undefined) {
    problems.push('AI_API_KEY: set, but no provider is chosen for it — set AI_ADVISOR_PROVIDER')
  }
  for (const slot of AI_SLOTS) {
    const own = [slot.provider, slot.model].filter((name) => value(name) !== undefined)
    const resolved = provider(slot.provider) ?? standard ?? withOwnKey
    if (resolved === 'deterministic') continue
    if (resolved === undefined) {
      const unused = [...own, ...(value(slot.key) !== undefined ? [slot.key] : [])]
      if (unused.length > 0) problems.push(`${unused.join(', ')}: set, but the ${slot.title} slot has no provider — set ${slot.provider}${slot.provider === 'AI_ADVISOR_PROVIDER' ? '' : ' or AI_ADVISOR_PROVIDER'}`)
      continue
    }
    const keys = [slot.key, ...(AI_PROVIDER_KEYS[resolved] ?? []), 'AI_API_KEY']
    if (own.length > 0 && !keys.some((key) => value(key) !== undefined)) {
      problems.push(`${own.join(', ')}: set, but no API key reaches the ${slot.title} slot (${resolved}) — set one of ${keys.join(', ')}`)
    }
  }
  return problems
}

/** Values that only work together. Also on the local stack: half a setup fails at first use, not at boot. */
function groupProblems(value: KnownValue, deployment: boolean, env: NodeJS.ProcessEnv): string[] {
  const problems: string[] = []
  const set = (name: string) => value(name) !== undefined

  const stripe = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_ID']
  const stripeSet = stripe.filter(set)
  if (!deployment && stripeSet.length > 0 && stripeSet.length < stripe.length) {
    problems.push(`${stripe.filter((name) => !stripeSet.includes(name)).join(', ')}: not set, but ${stripeSet.join(', ')} is — Stripe needs all three`)
  }
  if (stripeSet.length > 0 && selfEmploymentEnabled(env) && !set('STRIPE_PRICE_ID_SELBSTSTAENDIG')) {
    problems.push('STRIPE_PRICE_ID_SELBSTSTAENDIG: not set while SELBSTSTAENDIGE_ENABLED is on — the self-employment tier could not be sold')
  }

  const google = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'].filter(set)
  if (google.length === 1) problems.push(`GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET: only ${google[0]} is set — Google login needs both`)

  const apple = ['APPLE_CLIENT_ID', 'APPLE_CLIENT_SECRET']
  const appleMissing = apple.filter((name) => !set(name))
  if (appleMissing.length === 1) problems.push(`${appleMissing[0]}: not set, but the other Apple value is — Apple sign-in needs both`)
  if (value('APPLE_SIGN_IN_ENABLED') === 'true' && appleMissing.length === apple.length) {
    problems.push(`${apple.join(', ')}: not set while APPLE_SIGN_IN_ENABLED is true — the Apple button would not appear`)
  }

  if (value('EMAIL_DELIVERY') === 'smtp' && !set('SMTP_URL')) problems.push('SMTP_URL: not set while EMAIL_DELIVERY is smtp')

  const elster = ['ELSTER_ERIC_CLI', 'ELSTER_CERT_PATH', 'ELSTER_CERT_PIN', 'ELSTER_HERSTELLER_ID']
  const elsterMissing = elster.filter((name) => !set(name))
  if (isOn(value('ELSTER_TRANSMISSION_ENABLED')) && elsterMissing.length > 0) {
    problems.push(`${elsterMissing.join(', ')}: not set while ELSTER_TRANSMISSION_ENABLED is on — nothing could be transmitted`)
  }

  problems.push(...modelSlotProblems(value))
  return problems
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
  const value = readKnownValues(env)
  for (const setting of API_PRODUCTION_SETTINGS) {
    const current = value(setting.name)
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
  for (const variable of NON_PRODUCTION_VARIABLES) {
    if (variable.production === 'refused' && isOn(value(variable.name))) problems.push(`${variable.name}: switched on in production — ${variable.reason}`)
  }
  problems.push(...groupProblems(value, deployment, env))

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
