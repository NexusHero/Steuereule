import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { resolveBetterAuthSecret, resolveGoogleClientId, resolveGoogleClientSecret } from '../../src/auth/better-auth-env.js'
import { resolveGuestSessionSecret } from '../../src/auth/guest-session.js'
import { DEV_ONLY_KEYSTORE_SECRET } from '../../src/keystore/keystore-config.js'
import { resolveEmailHashSalt, resolveFieldEncryptionKey } from '../../src/prisma/field-encryption-key.js'
import {
  API_PRODUCTION_SETTINGS,
  assertProductionConfig,
  checkProductionConfig,
  isLocalProductionStack,
} from '../../src/config/production-config.js'

const repoFile = (path: string) => fileURLToPath(new URL(`../../../../${path}`, import.meta.url))

/** A complete deployment: every value present, none published anywhere in this repository. */
function deployment(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'production',
    K_SERVICE: 'steuereule-api',
    DATABASE_URL: 'postgresql://steuereule:pw@localhost/steuereule?host=/cloudsql/p:r:i',
    KEYSTORE_DATABASE_URL: 'postgresql://steuereule_keystore:pw@localhost/steuereule_keystore?host=/cloudsql/p:r:k',
    PRISMA_FIELD_ENCRYPTION_KEY: 'k1.aesgcm256.c2VjcmV0LWtleS1mb3ItdGhlLXRlc3Qtb25seS0zMmI=',
    PRISMA_FIELD_ENCRYPTION_HASH_SALT: 'Zq0d1Vb2Yw3Xe4Rt5Uy6Io7Pa8Sd9Fg0Hj1Kl2Mn3',
    KEYSTORE_MASTER_KEY: 'Pq9Wn8Eb7Rv6Tc5Yx4Uz3Ia2Os1Dl0Fk9Gj8Hh7Jg6',
    GUEST_SESSION_SECRET: 'Lm5Nb4Vc3Xz2As1Sd0Fg9Hj8Kl7Qw6Er5Ty4Ui3Op2',
    BETTER_AUTH_SECRET: 'Ab1Cd2Ef3Gh4Ij5Kl6Mn7Op8Qr9St0Uv1Wx2Yz3Ab4',
    BETTER_AUTH_URL: 'https://api.steuereule.example',
    WEB_APP_URL: 'https://www.steuereule.example',
    CORS_ALLOWED_ORIGINS: 'https://www.steuereule.example',
    TRUSTED_PROXIES: '169.254.0.0/16',
    BREVO_API_KEY: 'xkeysib-0123456789abcdef',
    EMAIL_FROM: 'noreply@steuereule.example',
    STRIPE_SECRET_KEY: 'sk_test_51abc',
    STRIPE_WEBHOOK_SECRET: 'whsec_abc',
    STRIPE_PRICE_ID: 'price_standard',
    STRIPE_PRICE_ID_SELBSTSTAENDIG: 'price_self',
    REDIS_URL: 'rediss://:pw@10.0.0.3:6378',
    APP_VERSION: '0123456789ab',
    STREET_DATA_PATH: fileURLToPath(import.meta.url),
    ...overrides,
  }
}

/** The variables of the local production-shaped stack: `.env.example` as docker-compose.prod.yml passes it on. */
function localStackFromEnvExample(): NodeJS.ProcessEnv {
  const example = Object.fromEntries(
    readFileSync(repoFile('.env.example'), 'utf8')
      .split('\n')
      .filter((line) => /^[A-Z_]+=/.test(line))
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
  )
  return {
    ...example,
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://steuereule:steuereule@postgres:5432/steuereule',
    KEYSTORE_DATABASE_URL: 'postgresql://steuereule:steuereule@postgres:5432/steuereule_keystore',
    BETTER_AUTH_URL: example.API_ORIGIN,
    CORS_ALLOWED_ORIGINS: example.WEB_ORIGIN,
    WEB_APP_URL: example.WEB_ORIGIN,
    TRUSTED_PROXIES: 'none',
    EMAIL_DELIVERY: 'smtp',
    SMTP_URL: 'smtp://mailpit:1025',
    REDIS_URL: 'redis://redis:6379',
  }
}

describe('production configuration at boot (beta P1)', () => {
  it('accepts a complete deployment', () => {
    expect(checkProductionConfig(deployment()).problems).toEqual([])
  })

  it('names every required value that is missing, with where it comes from', () => {
    const required = API_PRODUCTION_SETTINGS.filter((setting) => setting.need !== 'optional' && setting.name !== 'NODE_ENV')
    const env = deployment(Object.fromEntries(required.map((setting) => [setting.name, undefined])))
    const { problems } = checkProductionConfig(env)
    for (const setting of required) {
      expect(problems.some((problem) => problem.startsWith(`${setting.name}: not set`)), setting.name).toBe(true)
    }
    expect(() => assertProductionConfig(env)).toThrow(/Refusing to start[\s\S]*STRIPE_PRICE_ID: not set[\s\S]*Secret Manager/)
  })

  it('OPS-9: refuses a NODE_ENV that is none of production, development, test', () => {
    for (const nodeEnv of ['prod', 'staging', 'Production']) {
      expect(checkProductionConfig({ NODE_ENV: nodeEnv }).problems.join()).toMatch(/NODE_ENV: ".+" is not one of/)
    }
    expect(checkProductionConfig({ NODE_ENV: 'development' }).problems).toEqual([])
    expect(checkProductionConfig({}).problems).toEqual([])
  })

  it('H2-33: refuses the development fallback of every resolver on a deployment', () => {
    const outsideProduction: NodeJS.ProcessEnv = { NODE_ENV: 'development' }
    const fallbacks: Record<string, string | undefined> = {
      PRISMA_FIELD_ENCRYPTION_KEY: resolveFieldEncryptionKey(outsideProduction).encryptionKey,
      PRISMA_FIELD_ENCRYPTION_HASH_SALT: resolveEmailHashSalt(outsideProduction),
      KEYSTORE_MASTER_KEY: DEV_ONLY_KEYSTORE_SECRET,
      GUEST_SESSION_SECRET: resolveGuestSessionSecret(outsideProduction),
      BETTER_AUTH_SECRET: resolveBetterAuthSecret(outsideProduction),
      GOOGLE_CLIENT_ID: resolveGoogleClientId(outsideProduction),
      GOOGLE_CLIENT_SECRET: resolveGoogleClientSecret(outsideProduction),
    }
    for (const [name, fallback] of Object.entries(fallbacks)) {
      expect(fallback, name).toBeTruthy()
      expect(checkProductionConfig(deployment({ [name]: fallback })).problems.join('\n'), name).toMatch(new RegExp(`${name}: still a development value`))
    }
  })

  it('H2-33: refuses the development field key and every value published in .env.example on a deployment', () => {
    const example = localStackFromEnvExample()
    const secrets = API_PRODUCTION_SETTINGS.filter((setting) => setting.secret && example[setting.name])
    expect(secrets.map((setting) => setting.name)).toEqual(
      expect.arrayContaining(['PRISMA_FIELD_ENCRYPTION_KEY', 'PRISMA_FIELD_ENCRYPTION_HASH_SALT', 'KEYSTORE_MASTER_KEY', 'GUEST_SESSION_SECRET', 'BETTER_AUTH_SECRET']),
    )
    for (const setting of secrets) {
      const { problems } = checkProductionConfig(deployment({ [setting.name]: example[setting.name] }))
      expect(problems, setting.name).toContain(`${setting.name}: still a development value published in this repository — generate a real one`)
    }
  })

  it('H2-33: refuses every synthetic secret the CI workflows run with, should one reach a deployment', () => {
    const workflows = ['ci.yml', 'load.yml', 'quality.yml'].map((name) => readFileSync(repoFile(`.github/workflows/${name}`), 'utf8')).join('\n')
    const secrets = API_PRODUCTION_SETTINGS.filter((setting) => setting.secret)
    let seen = 0
    for (const match of workflows.matchAll(/^\s+([A-Z_]+): ([^\s$'"{}]+)$/gm)) {
      const setting = secrets.find((candidate) => candidate.name === match[1])
      if (!setting) continue
      seen += 1
      expect(checkProductionConfig(deployment({ [setting.name]: match[2] })).problems.join('\n'), `${match[1]}=${match[2]}`).toMatch(/development value/)
    }
    expect(seen).toBeGreaterThan(10)
  })

  it('H2-34: refuses the Google placeholder on a deployment, and half a Google login', () => {
    expect(checkProductionConfig(deployment({ GOOGLE_CLIENT_ID: 'dev-only-google-client-id', GOOGLE_CLIENT_SECRET: 'dev-only-google-client-secret' })).problems).toEqual([
      'GOOGLE_CLIENT_ID: still a development value published in this repository — generate a real one',
      'GOOGLE_CLIENT_SECRET: still a development value published in this repository — generate a real one',
    ])
    expect(checkProductionConfig(deployment({ GOOGLE_CLIENT_ID: 'x.apps.googleusercontent.com' })).problems.join()).toMatch(/Google login needs both/)
  })

  it('OPS-10: Stripe needs key, webhook secret and both price ids on a deployment', () => {
    expect(checkProductionConfig(deployment({ STRIPE_PRICE_ID: undefined })).problems.join()).toMatch(/^STRIPE_PRICE_ID: not set/)
    expect(checkProductionConfig(deployment({ STRIPE_PRICE_ID_SELBSTSTAENDIG: undefined })).problems.join()).toMatch(/STRIPE_PRICE_ID_SELBSTSTAENDIG: not set while SELBSTSTAENDIGE_ENABLED is on/)
    expect(checkProductionConfig(deployment({ STRIPE_PRICE_ID_SELBSTSTAENDIG: undefined, SELBSTSTAENDIGE_ENABLED: 'false' })).problems).toEqual([])
    expect(checkProductionConfig(deployment({ STRIPE_SECRET_KEY: 'pk_test_wrong' })).problems.join()).toMatch(/STRIPE_SECRET_KEY: must start with sk_test_/)
  })

  it('OPS-7: a deployment without Redis, or with Redis in plain text, does not start', () => {
    expect(checkProductionConfig(deployment({ REDIS_URL: undefined })).problems.join()).toMatch(/^REDIS_URL: not set/)
    expect(checkProductionConfig(deployment({ REDIS_URL: 'redis://10.0.0.3:6379' })).problems.join()).toMatch(/rediss:\/\//)
  })

  it('checks the format of what is set: field key, origins, https, proxies, the street file', () => {
    const problems = checkProductionConfig(
      deployment({
        PRISMA_FIELD_ENCRYPTION_KEY: 'not-a-key',
        CORS_ALLOWED_ORIGINS: '*',
        WEB_APP_URL: 'http://www.steuereule.example',
        TRUSTED_PROXIES: '0.0.0.0/0',
        STREET_DATA_PATH: '/nonexistent/streets.csv',
        GUEST_SESSION_SECRET: 'short',
      }),
    ).problems.join('\n')
    expect(problems).toMatch(/PRISMA_FIELD_ENCRYPTION_KEY: not of the form k1\.aesgcm256/)
    expect(problems).toMatch(/CORS_ALLOWED_ORIGINS: must not be "\*"/)
    expect(problems).toMatch(/WEB_APP_URL: must be an https:\/\/ URL on a deployment/)
    expect(problems).toMatch(/TRUSTED_PROXIES: TRUSTED_PROXIES contains overly broad entries/)
    expect(problems).toMatch(/STREET_DATA_PATH: file \/nonexistent\/streets.csv does not exist/)
    expect(problems).toMatch(/GUEST_SESSION_SECRET: shorter than 32 characters/)
  })

  it('the local production-shaped stack from .env.example starts, warning about its synthetic values', () => {
    const env = localStackFromEnvExample()
    expect(isLocalProductionStack(env)).toBe(true)
    expect(checkProductionConfig(env).problems).toEqual([])
    const warnings: string[] = []
    assertProductionConfig(env, (message) => warnings.push(message))
    expect(warnings.join()).toMatch(/PRISMA_FIELD_ENCRYPTION_KEY[\s\S]*refuses to start with them/)
  })

  it('the same values on Cloud Run or behind a public origin count as a deployment', () => {
    const env = localStackFromEnvExample()
    expect(isLocalProductionStack({ ...env, K_SERVICE: 'steuereule-api' })).toBe(false)
    expect(isLocalProductionStack({ ...env, WEB_APP_URL: 'https://www.steuereule.example' })).toBe(false)
    expect(checkProductionConfig({ ...env, K_SERVICE: 'steuereule-api' }).problems.join('\n')).toMatch(/PRISMA_FIELD_ENCRYPTION_KEY: still a development value/)
  })
})

describe('the settings an operator sets by hand are checked at boot, not at first use (ADR-0111)', () => {
  const problemsOf = (overrides: Record<string, string | undefined>) => checkProductionConfig(deployment(overrides)).problems

  it('refuses the test doubles of the chat model and the payment provider', () => {
    expect(problemsOf({ AI_FAKE_KI: 'true' }).join('\n')).toMatch(/^AI_FAKE_KI: switched on in production/m)
    expect(problemsOf({ PAYMENT_FAKE_PROVIDER: '1' }).join('\n')).toMatch(/^PAYMENT_FAKE_PROVIDER: switched on in production/m)
    expect(problemsOf({ AI_FAKE_KI: 'false', PAYMENT_FAKE_PROVIDER: 'off' })).toEqual([])
  })

  it('refuses a number, switch or choice the reading code would silently replace by its default', () => {
    expect(problemsOf({ AI_DAILY_MESSAGE_LIMIT: '5000' }).join()).toMatch(/AI_DAILY_MESSAGE_LIMIT: .*from 1 to 1000/)
    expect(problemsOf({ AI_PAID_RESERVE_PERCENT: '-1' }).join()).toMatch(/AI_PAID_RESERVE_PERCENT/)
    expect(problemsOf({ AI_KILL_SWITCH: 'enabled' }).join()).toMatch(/AI_KILL_SWITCH: .*must be one of/)
    expect(problemsOf({ AI_ADVISOR_PROVIDER: 'gemini' }).join()).toMatch(/AI_ADVISOR_PROVIDER: .*must be one of/)
    expect(problemsOf({ AI_TEMPERATURE: '3' }).join()).toMatch(/AI_TEMPERATURE/)
    expect(problemsOf({ AI_BASE_URL: 'http://models.example' }).join()).toMatch(/AI_BASE_URL: .*https/)
    expect(problemsOf({ AI_DAILY_MESSAGE_LIMIT: '200', AI_PAID_RESERVE_PERCENT: '0', AI_KILL_SWITCH: 'on', AI_TEMPERATURE: '0.2' })).toEqual([])
  })

  it('refuses a model key copied from the documentation', () => {
    expect(problemsOf({ ANTHROPIC_API_KEY: 'sk-ant-...' }).join()).toMatch(/ANTHROPIC_API_KEY/)
    expect(problemsOf({ GEMINI_API_KEY: 'AIzaSyAbc…' }).join()).toMatch(/GEMINI_API_KEY: .*ellipsis/)
    expect(problemsOf({ GEMINI_API_KEY: 'AIzaSyAbcdefghijklmnop' })).toEqual([])
  })

  it('a model slot needs a provider and a key that reaches it', () => {
    expect(problemsOf({ AI_API_KEY: 'key-without-provider' }).join()).toMatch(/AI_API_KEY: set, but no provider is chosen/)
    expect(problemsOf({ AI_VISION_MODEL: 'gemini-2.5-pro' }).join()).toMatch(/AI_VISION_MODEL: set, but the document slot has no provider/)
    expect(problemsOf({ AI_ADVISOR_PROVIDER: 'anthropic', AI_ADVISOR_MODEL: 'claude-x' }).join()).toMatch(/no API key reaches the chat slot \(anthropic\)/)
    expect(problemsOf({ AI_ADVISOR_PROVIDER: 'anthropic', AI_ADVISOR_MODEL: 'claude-x', ANTHROPIC_API_KEY: 'sk-ant-real' })).toEqual([])
    expect(problemsOf({ AI_ADVISOR_PROVIDER: 'deterministic', AI_ADVISOR_MODEL: 'none' })).toEqual([])
  })

  it('values that only work together: Apple sign-in, SMTP delivery, the E-Bilanz transmission', () => {
    expect(problemsOf({ APPLE_CLIENT_ID: 'com.example.signin' }).join()).toMatch(/APPLE_CLIENT_SECRET: not set, but the other Apple value is/)
    expect(problemsOf({ APPLE_SIGN_IN_ENABLED: 'true' }).join()).toMatch(/APPLE_SIGN_IN_ENABLED is true/)
    expect(problemsOf({ EMAIL_DELIVERY: 'smtp' }).join()).toMatch(/SMTP_URL: not set while EMAIL_DELIVERY is smtp/)
    expect(problemsOf({ EMAIL_DELIVERY: 'log' }).join()).toMatch(/EMAIL_DELIVERY: .*refused in production/)
    expect(problemsOf({ ELSTER_TRANSMISSION_ENABLED: 'on', ELSTER_HERSTELLER_ID: '12345' }).join()).toMatch(/ELSTER_ERIC_CLI, ELSTER_CERT_PATH, ELSTER_CERT_PIN: not set while ELSTER_TRANSMISSION_ENABLED is on/)
    expect(problemsOf({ ELSTER_CERT_PATH: '/nowhere/cert.pfx' }).join()).toMatch(/ELSTER_CERT_PATH: .*does not exist/)
  })
})
