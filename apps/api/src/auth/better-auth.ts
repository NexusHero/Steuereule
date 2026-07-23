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
import { haveIBeenPwned } from 'better-auth/plugins'
import { hibpFailOpenPlugin } from './breach-check.js'
import type { EmailSender } from './email-sender.js'
import { createGuestAccountUpgradeHook } from './guest-account-upgrade.js'

const DEV_ONLY_FALLBACK_SECRET = 'dev-only-insecure-better-auth-secret-do-not-use-in-production'
const DEV_ONLY_FALLBACK_URL = 'http://localhost:3000'

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

export interface CreateBetterAuthOptions {
  prisma: PrismaClient
  secret: string
  baseUrl: string
  /** The same CORS allowlist origin() feeds (ADR-0012 §5) — one shared source of
   *  truth, wired to better-auth's origin-based CSRF check via `trustedOrigins`. */
  trustedOrigins: string[]
  emailSender: EmailSender
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
}

/** Builds the shared better-auth config object once — passed to both `betterAuth()`
 *  (to construct the real instance) and `getCookies()` (to derive the session cookie
 *  name), so the two can never see different config. */
function buildOptions(options: CreateBetterAuthOptions): BetterAuthOptions {
  const { prisma, secret, baseUrl, trustedOrigins, emailSender } = options

  return {
    baseURL: baseUrl,
    secret,
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    trustedOrigins,
    emailAndPassword: {
      enabled: true,
      // Account works immediately (autoSignIn, REQ-005) — verification is async and
      // never blocks basic use; the UI renders the honest "please verify" state from
      // session.user.emailVerified instead (ADR-0012 §6).
      autoSignIn: true,
      requireEmailVerification: false,
      minPasswordLength: 8,
    },
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
    plugins: [haveIBeenPwned(), hibpFailOpenPlugin],
    rateLimit: {
      enabled: true,
      // Backed by the DB (the RateLimit table, ADR-0012 §5), not in-memory — a limit
      // that resets per pod is trivially bypassed on a horizontally scaled deployment.
      storage: 'database',
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
  return { auth, sessionCookieName }
}
