// The better-auth configuration factory (ADR-0012 §1), mirroring the existing
// `resolve*(env)` idiom (resolveGuestSessionSecret / resolveCorsOrigins /
// resolveFieldEncryptionKey): secrets and the public base URL come from env
// (12-Factor III), never hard-coded, with a clearly-marked dev-only fallback that
// refuses to be reachable in production.
//
// better-auth owns its own tables (user/session/account/verification — see the
// expand-only migration in prisma/schema.prisma) via the Prisma adapter, so this
// factory is handed the *same* PrismaService connection ProfileModule already uses
// — no second DB client, no second DATABASE_URL.
import type { PrismaClient } from '@prisma/client'
import { prismaAdapter } from '@better-auth/prisma-adapter'
import { betterAuth, type Auth, type BetterAuthOptions } from 'better-auth'
import { getCookies } from 'better-auth/cookies'
import { deviceAuthorization, haveIBeenPwned } from 'better-auth/plugins'
import { hibpFailOpenPlugin } from './breach-check.js'
import type { EmailSender } from './email-sender.js'
import { createGuestAccountUpgradeHook } from './guest-account-upgrade.js'

const DEV_ONLY_FALLBACK_SECRET = 'dev-only-insecure-better-auth-secret-do-not-use-in-production'
const DEV_ONLY_FALLBACK_URL = 'http://localhost:3000'

/** Dev-only Google OAuth credentials for local testing (REQ-008).
 *  These are NOT real Google credentials — they are placeholder values that
 *  better-auth's `/api/auth/sign-in/social` endpoint will accept in dev/test,
 *  enabling the Google sign-in button to appear and the flow to be exercised
 *  with a test double. Production MUST set real values. */
const DEV_ONLY_GOOGLE_CLIENT_ID = 'dev-only-google-client-id'
const DEV_ONLY_GOOGLE_CLIENT_SECRET = 'dev-only-google-client-secret'

/**
 * The `device-authorization` plugin's own HTTP surface (#238, RFC 8628 path names —
 * exact strings from `better-auth/dist/plugins/device-authorization/routes.mjs`),
 * switched off at the router via `disabledPaths` (ADR-0024). A browser must never
 * reach these directly: `/device/token` returns a Bearer token in the JSON body
 * instead of setting a session cookie (ADR-0008/0012 forbid holding one in
 * JS-reachable storage), the plugin has no way to honour our "just for now" vs
 * "trust this device" session-scope choice, no columns exist here to verify a
 * request's browser/OS/region/time against, and `/device` (GET) skips the origin
 * check for all GET requests — reachable cross-site under our `SameSite=None`
 * cookie. `disabledPaths` gates HTTP routing only (`api/index.mjs`'s `onRequest`) —
 * the server-side `auth.api.*` calls this app makes instead still work, which is the
 * whole point of the wrapper (same shape as the `UserContextGuard` seam). A
 * better-auth upgrade must re-check `routes.mjs`/`origin-check.mjs` before assuming
 * this list is still complete — see ADR-0024.
 */
export const DEVICE_AUTHORIZATION_DISABLED_PATHS = ['/device/code', '/device/token', '/device', '/device/approve', '/device/deny']

/**
 * Resolves the better-auth signing/encryption secret. Production must set
 * BETTER_AUTH_SECRET explicitly — refusing to start under a guessable default is
 * the whole point of the seam (mirrors resolveGuestSessionSecret).
 */
export function resolveBetterAuthSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.BETTER_AUTH_SECRET
  if (secret && secret.length > 0) return secret
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'BETTER_AUTH_SECRET must be set in production — refusing to sign/encrypt real ' +
        'sessions under a guessable default secret (ADR-0012).',
    )
  }
  return DEV_ONLY_FALLBACK_SECRET
}

/** Resolves better-auth's own base URL (used to build absolute verification/reset links). */
export function resolveBetterAuthUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.BETTER_AUTH_URL
  if (url && url.length > 0) return url
  if (env.NODE_ENV === 'production') {
    throw new Error('BETTER_AUTH_URL must be set in production (ADR-0012).')
  }
  return DEV_ONLY_FALLBACK_URL
}

/** Resolves the Google OAuth client ID (REQ-008). Falls back to a dev-only placeholder
 *  outside production; production MUST set GOOGLE_CLIENT_ID to a real value from the
 *  Google Cloud Console. When absent in production, Google sign-in stays disabled
 *  (better-auth's social provider is not configured). */
export function resolveGoogleClientId(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const id = env.GOOGLE_CLIENT_ID
  if (id && id.length > 0) return id
  if (env.NODE_ENV === 'production') {
    // Production refuses to fall back — Google sign-in must be explicitly configured.
    return undefined
  }
  return DEV_ONLY_GOOGLE_CLIENT_ID
}

/** Resolves the Google OAuth client secret (REQ-008). Same rules as resolveGoogleClientId. */
export function resolveGoogleClientSecret(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const secret = env.GOOGLE_CLIENT_SECRET
  if (secret && secret.length > 0) return secret
  if (env.NODE_ENV === 'production') {
    return undefined
  }
  return DEV_ONLY_GOOGLE_CLIENT_SECRET
}

export interface CreateBetterAuthOptions {
  prisma: PrismaClient
  secret: string
  baseUrl: string
  /** The same CORS allowlist origin() feeds (ADR-0012 §5) — one shared source of
   *  truth, wired to better-auth's origin-based CSRF check via `trustedOrigins`. */
  trustedOrigins: string[]
  emailSender: EmailSender
  /** Google OAuth client ID (REQ-008). Empty/undefined = Google sign-in disabled. */
  googleClientId?: string | undefined
  /** Google OAuth client secret (REQ-008). Empty/undefined = Google sign-in disabled. */
  googleClientSecret?: string | undefined
  /**
   * The API's own trusted reverse-proxy addresses (#241,
   * `resolveTrustedProxies()`), fed straight through to better-auth's
   * `advanced.ipAddress.trustedProxies`. Governs `getIp()` — and therefore both
   * `Session.ipAddress` and better-auth's own built-in rate limiter — which
   * otherwise trust `X-Forwarded-For` verbatim. Empty means "no proxy configured",
   * the same runtime posture this app has always had; see trusted-proxies.ts's own
   * header comment for the full reasoning (including what this can and cannot fix).
   */
  trustedProxies: string[]
}

export interface BetterAuthBundle {
  auth: Auth
  /**
   * The exact cookie name better-auth issues its session under, given our config.
   * Computed via better-auth's own `getCookies()` rather than re-deriving its
   * naming/`__Secure-` prefixing rules here, so UserContextGuard's guest-vs-session
   * cookie fork can never drift from what better-auth itself actually sets.
   */
  sessionCookieName: string
  /**
   * The social providers this instance will actually accept, derived from the exact
   * `socialProviders` object handed to better-auth rather than a second read of the
   * environment — so the capability probe (REQ-008) can never advertise a provider the
   * server would reject. Empty when none are configured.
   */
  enabledSocialProviders: readonly string[]
}

/** Builds the shared better-auth config object once — passed to both `betterAuth()`
 *  (to construct the real instance) and `getCookies()` (to derive the session cookie
 *  name), so the two can never see different config. */
function buildOptions(options: CreateBetterAuthOptions): BetterAuthOptions {
  const { prisma, secret, baseUrl, trustedOrigins, emailSender, googleClientId, googleClientSecret, trustedProxies } = options

  // Google social provider is enabled only when both credentials are provided (REQ-008).
  // When absent, better-auth's `/api/auth/sign-in/social` rejects `provider: 'google'`,
  // and the frontend surfaces that rejection as an honest error rather than a fake success.
  // Note the frontend does NOT gate the button on this: it renders the Google option
  // unconditionally, so a deployment that never sets GOOGLE_CLIENT_ID/SECRET shows a button
  // whose every press ends in that error. Configure both in any environment where the
  // button is meant to work; a capability probe that lets the UI hide it is still open.
  const socialProviders: NonNullable<BetterAuthOptions['socialProviders']> = {}
  if (googleClientId && googleClientSecret) {
    socialProviders.google = {
      clientId: googleClientId,
      clientSecret: googleClientSecret,
    }
  }

  return {
    baseURL: baseUrl,
    secret,
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    trustedOrigins,
    emailAndPassword: {
      enabled: true,
      // Account works immediately (autoSignIn, REQ-005) — verification is async and
      // never blocks basic use; the UI renders the honest "please verify" state from
      // session.user.emailVerified instead. (Was miscited as ADR-0012 §6, which is "Email
      // delivery" and says nothing about this — the actual spec is REQ-005's register entry,
      // docs/requirements/register.md; fixed #194.)
      autoSignIn: true,
      requireEmailVerification: false,
      minPasswordLength: 8,
    },
    socialProviders,
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: async ({ user, url, token }) => {
        await emailSender.sendVerificationEmail({
          to: user.email,
          subject: 'Bitte bestätige deine E-Mail-Adresse — SteuerEule',
          url,
          token,
        })
      },
    },
    // haveIBeenPwned() is the real, sanctioned k-anonymity breach check (reused, not
    // reinvented — ADR-0009/ADR-0012 §5); hibpFailOpenPlugin wraps it with the one
    // behaviour it doesn't support alone — failing open on a provider outage instead
    // of hard-rejecting signup (see breach-check.ts). Order matters: it must run
    // after haveIBeenPwned() so it wraps the already-checking hash function.
    //
    // deviceAuthorization() (#238, ADR-0024): RFC 8628 mechanics only — code
    // generation/expiry/polling-throttle/status transitions. Its own HTTP routes are
    // switched off (`disabledPaths` below); our `/v1/device/*` endpoints call
    // `auth.api.*` server-side instead. `expiresIn: '2m'`, not the 30m default — a QR
    // on screen doesn't need half an hour, and the window is a direct multiplier on
    // how many codes are pending (and therefore guessable) at once. `interval` and
    // `generateUserCode` are left at their defaults: the default 8-char/32-symbol
    // `generateUserCode` draws exactly 40 bits, uniformly (no modulo bias — 256 % 32
    // === 0), and lengthening it only costs the human reading it off a screen.
    plugins: [haveIBeenPwned(), hibpFailOpenPlugin, deviceAuthorization({ expiresIn: '2m' })],
    // A browser must never reach the plugin's own HTTP routes (see the constant's own
    // doc comment above for why) — this is what actually enforces that; the
    // server-side `auth.api.*` calls this app makes are untouched by it.
    disabledPaths: DEVICE_AUTHORIZATION_DISABLED_PATHS,
    rateLimit: {
      enabled: true,
      // Backed by the DB (the RateLimit table, ADR-0012 §5), not in-memory — a limit
      // that resets per pod is trivially bypassed on a horizontally scaled deployment.
      storage: 'database',
      // better-auth's own built-in special-path rules (window 10s/max 3) already cover
      // /sign-in*, /sign-up*, /change-password, /change-email — but NOT /verify-password,
      // which otherwise falls back to the generic default (window 10s/max 100, far too
      // loose for a password-guessing surface). ADR-0013 §6 requires DELETE /v1/account's
      // fresh-auth re-verification step to be "rate-limited via the existing DB-backed
      // RateLimit table — no new mechanism": `customRules` is that same built-in
      // extension point (still the one shared DB-backed limiter/table), just naming one
      // more path at the same strictness better-auth already applies to sign-in. Caught
      // by the real-Postgres REQ-011 acceptance test before this reached review — 12
      // wrong-password DELETE attempts never tripped 429 under the bare default.
      //
      // '/device' (ADR-0024): named here per the ADR, at the strictness a guessable
      // 40-bit code deserves — but be clear-eyed about what it actually covers. This
      // is better-auth's *router-bound* limiter (`onRequestRateLimit` in its
      // `onRequest` hook, `api/index.mjs`); it only ever runs for a request that
      // reaches the plugin's HTTP router, and `/device` is one of the five paths
      // `disabledPaths` 404s before that limiter is even consulted (disabledPaths is
      // checked first — same file, same hook). It also never fires for a direct
      // `auth.api.*` in-process call, which is exactly the gap
      // `verify-password-rate-limit.ts` documents and works around for
      // `/verify-password`'s own in-process caller (`FreshAuthChecker`). The rule
      // stays here because it is genuinely harmless and keeps the ADR's stated
      // config real rather than aspirational — but it is NOT what protects
      // `/v1/device/pending`, our own Nest endpoint that calls
      // `auth.api.deviceVerify()` server-side and is the actual externally-reachable
      // surface a code-guessing attacker would hit. That endpoint (task 2) needs its
      // own DB-backed limiter in the `verify-password-rate-limit.ts` shape, keyed per
      // IP, same window/max — tracked there, not solved by this entry alone.
      customRules: {
        '/verify-password': { window: 10, max: 3 },
        '/device': { window: 60, max: 10 },
      },
    },
    advanced: {
      defaultCookieAttributes: {
        httpOnly: true,
        // SameSite=None; Secure (ADR-0012 §3, supersedes ADR-0009/REQ-009's
        // `strict` wording) — the same cross-site reality ADR-0011 already forced on
        // the guest cookie: the deployed demo has the web app and API on distinct
        // *.fly.dev registrable domains, a genuinely cross-site credentialed call.
        sameSite: 'none',
        secure: true,
      },
      // Secure explicitly, independent of NODE_ENV — keeps the cookie NAME
      // deterministic (no environment-dependent `__Secure-` prefix toggling) so
      // UserContextGuard's derived sessionCookieName is stable across dev and prod.
      useSecureCookies: true,
      // better-auth defaults `skipOriginCheck` to `true` whenever `NODE_ENV=test`
      // (a test-convenience default in the library, `isTest()`) *unless*
      // `disableOriginCheck` is explicitly set — which would silently make REQ-010's
      // origin-based CSRF check a no-op under our own test/CI NODE_ENV=test runs,
      // the opposite of "no UX regression on legitimate traffic" (it's not a UX
      // concern to have this off, it's this exact control going untested). Setting
      // it explicitly to `false` here makes the check deterministic across every
      // environment, dev/test/prod alike.
      disableOriginCheck: false,
      // #241: which hops to strip from a forwarded IP chain before trusting what's
      // left — governs both Session.ipAddress and better-auth's own built-in rate
      // limiter (both read via its `getIp()`). Empty (today's default outside
      // production) is today's actual shipped posture, unchanged by introducing
      // this seam; see resolveTrustedProxies()/trusted-proxies.ts for the full
      // reasoning, including the single-value X-Forwarded-For bypass this can NOT
      // close by itself.
      ipAddress: {
        trustedProxies,
      },
    },
    // Guest -> account upgrade (REQ-006, ADR-0012 §4): fires on every session
    // creation — sign-up (autoSignIn) and plain sign-in alike — so it covers both
    // "brand-new account, guest had data" and "returning account, stray guest
    // cookie" with the same one hook. See guest-account-upgrade.ts.
    databaseHooks: {
      session: {
        create: {
          after: createGuestAccountUpgradeHook(prisma),
        },
      },
    },
  }
}

export function createBetterAuth(options: CreateBetterAuthOptions): BetterAuthBundle {
  const authOptions = buildOptions(options)
  const auth = betterAuth(authOptions)
  const sessionCookieName = getCookies(authOptions).sessionToken.name
  const enabledSocialProviders = Object.keys(authOptions.socialProviders ?? {})
  return { auth, sessionCookieName, enabledSocialProviders }
}
