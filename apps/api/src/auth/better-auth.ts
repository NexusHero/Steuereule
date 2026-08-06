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
// The web app's own origin (as opposed to `DEV_ONLY_FALLBACK_URL`, the *API's* origin
// above) — same value the API's own CORS allowlist and the frontend's local Expo web
// dev server use (apps/api/.env.example, .github/workflows/ci.yml).
const DEV_ONLY_FALLBACK_WEB_APP_URL = 'http://localhost:8081'

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
 * whole point of the wrapper (same shape as the `UserContextGuard` seam).
 *
 * #262: this list used to be trusted by a comment ("re-check on a version bump") —
 * Musti's verdict was that a comment asking a human to remember is not a control.
 * It is now proven equal to the plugin's own declared route set at every
 * construction, not merely re-read by hand on a bump — see
 * `assertDeviceAuthorizationDisabledPathsComplete` below, called from
 * `buildOptions()`. A better-auth upgrade that adds, removes, or renames a route
 * now refuses to boot instead of silently widening what a browser can reach.
 */
export const DEVICE_AUTHORIZATION_DISABLED_PATHS = ['/device/code', '/device/token', '/device', '/device/approve', '/device/deny']

/** Structural shape of a constructed better-call/better-auth endpoint — once built,
 *  it carries a `.path` string property (`better-call`'s `createEndpoint`,
 *  `dist/endpoint.mjs`: `internalHandler.path = path`), the exact property
 *  better-auth's own router reads to build its endpoint registry and to test
 *  `disabledPaths.includes(normalizedPath)` (`better-auth/dist/api/index.mjs`,
 *  `checkEndpointConflicts`/the `onRequest` hook). Narrow and structural, not the
 *  library's own type, so a test can hand in a synthetic plugin object without
 *  constructing a real one (#262). */
interface ConstructedPluginEndpoint {
  path?: unknown
}

/** Structural shape of what `deviceAuthorization(...)` (or any better-auth plugin
 *  factory) returns — only `.endpoints` is needed here (#262). */
export interface DeviceAuthorizationPluginLike {
  endpoints?: Record<string, ConstructedPluginEndpoint>
}

/**
 * Reads the device-authorization plugin's own declared HTTP route set directly off
 * its constructed `endpoints` — the same mechanism better-auth's own router uses
 * internally (`Object.entries(plugin.endpoints)`, filtering on `"path" in endpoint
 * && typeof endpoint.path === 'string'`, `better-auth/dist/api/index.mjs`) — instead
 * of a second hand-maintained list (#262). A version bump that adds, removes, or
 * renames a route changes what this returns; nothing here restates it.
 */
export function deviceAuthorizationPluginPaths(plugin: DeviceAuthorizationPluginLike): string[] {
  return Object.values(plugin.endpoints ?? {})
    .filter((endpoint): endpoint is ConstructedPluginEndpoint & { path: string } => typeof endpoint?.path === 'string')
    .map((endpoint) => endpoint.path)
}

/**
 * Fails loudly, at plugin-construction time (every boot — dev, test and prod alike,
 * not only in a dedicated test), if `DEVICE_AUTHORIZATION_DISABLED_PATHS` has
 * drifted from the plugin's own declared routes (#262). This is the control that
 * replaces `device-authorization-api.ts`'s "re-check this file on a version bump"
 * comment for the disabledPaths half specifically — Musti's review: a comment asking
 * a human to remember is not a control.
 *
 * Guards two distinct failures of the introspection itself, not only a drift in what
 * it finds (ADR-0021 amendment §1, "an existence claim checked as a validity claim"),
 * because they are not the same finding and must not share a message:
 *
 * 1. **Total vacuum** — either the plugin registered zero endpoints, or it registered
 *    some but *none* of them yielded a readable `.path` (#272 F1 — a better-call
 *    change that drops `.path` on every endpoint at once leaves the endpoint map
 *    intact; keying this branch on the endpoint count alone missed exactly that
 *    shape and produced an internally-contradictory "only 0 yielded ... for some,
 *    not all" message). Either way, nothing here is verifiable at all; almost
 *    certainly means the introspection broke outright (a better-auth/better-call
 *    internal shape changed), not that the plugin genuinely has no routes.
 * 2. **Partial vacuum** (#272, Salih's finding) — *some* endpoints keep a readable
 *    `.path`, at least one doesn't. The naive set-comparison below would then see the
 *    unreadable ones as simply *absent* and report them under
 *    `disabledButNotDeclared` — "the plugin no longer declares this, a stale entry,
 *    not itself a hole" — which is doubly wrong: the plugin *does* still declare it
 *    (the endpoint exists; only reading its `.path` failed), and whether a hole
 *    exists is exactly what a partial read cannot determine. Musti's ruling: a
 *    control that fails closed and then tells the operator the failure is harmless is
 *    worse than one that stays silent — it gives the operator a reason not to look.
 *    This branch states both counts, names no route, and claims neither safety nor
 *    staleness — only that coverage is unverifiable, which is reason enough to
 *    refuse to start.
 *
 * Only once every registered endpoint has yielded a readable path does the set
 * comparison below run at all — neither vacuum branch reaches it.
 */
export function assertDeviceAuthorizationDisabledPathsComplete(plugin: DeviceAuthorizationPluginLike): void {
  const registeredEndpointCount = Object.keys(plugin.endpoints ?? {}).length
  const pluginPaths = deviceAuthorizationPluginPaths(plugin)

  if (registeredEndpointCount === 0 || pluginPaths.length === 0) {
    throw new Error(
      `device-authorization plugin registered ${registeredEndpointCount} endpoint(s), of which ` +
        `${pluginPaths.length} yielded a readable string .path — the introspection ` +
        '`deviceAuthorizationPluginPaths` (better-auth.ts) relies on has almost certainly broken outright (a ' +
        'better-auth/better-call internal shape changed), not genuinely become empty. Re-check `.endpoints`/' +
        '`.path` against the installed better-auth version before trusting DEVICE_AUTHORIZATION_DISABLED_PATHS ' +
        'is still correct (#262).',
    )
  }

  if (pluginPaths.length < registeredEndpointCount) {
    throw new Error(
      `device-authorization plugin registered ${registeredEndpointCount} endpoint(s), but only ` +
        `${pluginPaths.length} yielded a readable string .path — the introspection is partially broken (a ` +
        'better-auth/better-call internal shape changed for some, not all, endpoints). Coverage against ' +
        'DEVICE_AUTHORIZATION_DISABLED_PATHS cannot be determined from an incomplete read — this is neither ' +
        'proven safe nor proven stale, only unverifiable, which is reason enough to refuse to start. Re-check ' +
        '`.endpoints`/`.path` against the installed better-auth version before trusting this control at all (#262).',
    )
  }

  const declared = new Set(pluginPaths)
  const disabled = new Set(DEVICE_AUTHORIZATION_DISABLED_PATHS)
  const declaredButNotDisabled = pluginPaths.filter((path) => !disabled.has(path))
  const disabledButNotDeclared = DEVICE_AUTHORIZATION_DISABLED_PATHS.filter((path) => !declared.has(path))

  if (declaredButNotDisabled.length > 0 || disabledButNotDeclared.length > 0) {
    const problems: string[] = []
    if (declaredButNotDisabled.length > 0) {
      problems.push(
        `the plugin now declares ${JSON.stringify(declaredButNotDisabled)}, which ` +
          'DEVICE_AUTHORIZATION_DISABLED_PATHS does not cover — reachable directly by a browser, bypassing ' +
          'the controller checks this whole design exists to interpose',
      )
    }
    // Reached only once every registered endpoint yielded a readable path — but
    // "readable" is not "correct": a wrong-but-string `.path` still lands here and
    // can misreport. No distinctness guard on purpose: it would refuse to boot the
    // day two endpoints legitimately share one path across different HTTP methods.
    if (disabledButNotDeclared.length > 0) {
      problems.push(
        `DEVICE_AUTHORIZATION_DISABLED_PATHS still names ${JSON.stringify(disabledButNotDeclared)}, which the ` +
          'plugin no longer declares — a stale entry, not itself a hole, but worth removing',
      )
    }
    throw new Error(
      'DEVICE_AUTHORIZATION_DISABLED_PATHS (better-auth.ts) has drifted from the device-authorization ' +
        `plugin's own declared routes: ${problems.join('; ')}. Re-check device-authorization-api.ts too, per ` +
        'its own header comment (#262).',
    )
  }
}

/**
 * The session cookie's own static attributes (name aside) — extracted to one place
 * so `advanced.defaultCookieAttributes` below and `/v1/device/token`'s hand-built
 * `Set-Cookie` (task 2, ADR-0024 — the plugin's own `/device/token` route never
 * calls `setSessionCookie`, so this app must construct that cookie itself) can never
 * silently drift apart. `path: '/'` matches `createCookie()`'s own base default
 * (`better-auth/dist/cookies/index.mjs`) — not set via `defaultCookieAttributes`
 * today, but pinned here explicitly since task 2 depends on it.
 */
export const SESSION_COOKIE_ATTRIBUTES = {
  httpOnly: true,
  // SameSite=None; Secure (ADR-0012 §3, supersedes ADR-0009/REQ-009's `strict`
  // wording) — see the identical comment on `advanced.defaultCookieAttributes`
  // below for the full cross-site reasoning; kept in sync by construction, not by
  // two separately-maintained comments.
  sameSite: 'none' as const,
  secure: true,
  path: '/',
}

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

/**
 * Resolves the web app's own origin — used to build the device-authorization QR's
 * `verification_uri_complete` (#238, ADR-0024). Deliberately its OWN env var, not
 * derived from `CORS_ALLOWED_ORIGINS`: that's an allowlist with no "canonical first
 * entry" semantics, so pulling one value out of it would be a silent assumption about
 * which of possibly several trusted origins is "the" web app. Without this, better-auth's
 * `deviceAuthorization` plugin falls back to its own `baseURL` — the *API's* origin
 * (`buildVerificationUris`, `better-auth/dist/plugins/device-authorization/routes.mjs`) —
 * and the QR then points a phone at a bare API server with no route for it: a 404, no
 * HTML, nothing a router can ever resolve. Caught by Kaan building the frontend route
 * against it and finding it dead on arrival.
 */
export function resolveWebAppUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.WEB_APP_URL
  if (url && url.length > 0) return url
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'WEB_APP_URL must be set in production — without it the device-authorization QR ' +
        "points at the API's own origin instead of the web app's (ADR-0024).",
    )
  }
  return DEV_ONLY_FALLBACK_WEB_APP_URL
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
  /**
   * The web app's own origin (#238, ADR-0024) — used to build the device-authorization
   * QR's `verificationUri`, so it points at a route the frontend router actually owns
   * instead of falling back to `baseUrl` (the API's own origin). See
   * `resolveWebAppUrl`'s doc comment for the full reasoning.
   */
  webAppUrl: string
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
  /**
   * The device-issued session's lifetime, in seconds (#238 task 2, ADR-0024) — one
   * fixed value; NexusHero dropped the "just for now" vs "trust this device"
   * session-scope choice, so there is no second, shorter variant to compute.
   * Computed the exact same way better-auth's own context does internally
   * (`options.session?.expiresIn || 60 * 60 * 24 * 7`,
   * `better-auth/dist/context/create-context.mjs`'s `sessionConfig.expiresIn`), so
   * `/v1/device/token`'s hand-built `Set-Cookie` `Max-Age` can never drift from what
   * better-auth itself would have used, without needing to configure
   * `session.expiresIn` twice.
   */
  sessionExpiresInSeconds: number
}

/** Builds the shared better-auth config object once — passed to both `betterAuth()`
 *  (to construct the real instance) and `getCookies()` (to derive the session cookie
 *  name), so the two can never see different config. */
function buildOptions(options: CreateBetterAuthOptions): BetterAuthOptions {
  const {
    prisma,
    secret,
    baseUrl,
    trustedOrigins,
    emailSender,
    webAppUrl,
    googleClientId,
    googleClientSecret,
    trustedProxies,
  } = options

  // Google social provider is enabled only when both credentials are provided (REQ-008).
  // When absent, better-auth's `/api/auth/sign-in/social` rejects `provider: 'google'`.
  // The frontend's `useSocialSignInAvailable` (apps/mobile-web) probes this deployment's
  // own capabilities endpoint and hides the Google button unless it answers available —
  // so an unconfigured deployment never shows an affordance that would only end in that
  // rejection. Configure both in any environment where the button should appear at all.
  const socialProviders: NonNullable<BetterAuthOptions['socialProviders']> = {}
  if (googleClientId && googleClientSecret) {
    socialProviders.google = {
      clientId: googleClientId,
      clientSecret: googleClientSecret,
    }
  }

  // Constructed once here (not inline in `plugins: [...]` below) so its own declared
  // routes can be read back and checked against DEVICE_AUTHORIZATION_DISABLED_PATHS
  // before this config is handed to `betterAuth()` (#262) — the same plugin instance
  // both consume, never two separately-constructed ones that could drift.
  const deviceAuthorizationPlugin = deviceAuthorization({ expiresIn: '2m', verificationUri: `${webAppUrl}/device` })
  assertDeviceAuthorizationDisabledPathsComplete(deviceAuthorizationPlugin)

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
    //
    // `verificationUri` MUST be set explicitly to the web app's own origin. Left
    // unset, `buildVerificationUris` (`routes.mjs`) falls back to `ctx.context.baseURL`
    // — our own `baseUrl` above, the API's origin — and the QR then encodes
    // `<api-origin>/device?user_code=...`: a phone lands on the bare API server, at a
    // path no controller serves, with `disabledPaths` not applying either (that only
    // gates `/device*` beneath `/api/auth`). Fastify answers a plain 404 — no HTML, no
    // router, nothing to resolve. Found only because nothing asserted the *origin* of
    // `verification_uri_complete`; every prior test supplied its own path and so never
    // saw a real one. `/device` matches the plugin's own default path name — the
    // frontend router's own route for it, reserved but not yet built.
    plugins: [haveIBeenPwned(), hibpFailOpenPlugin, deviceAuthorizationPlugin],
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
      // SameSite=None; Secure (ADR-0012 §3, supersedes ADR-0009/REQ-009's `strict`
      // wording) — the same cross-site reality ADR-0011 already forced on the guest
      // cookie: the deployed demo has the web app and API on distinct *.fly.dev
      // registrable domains, a genuinely cross-site credentialed call.
      defaultCookieAttributes: SESSION_COOKIE_ATTRIBUTES,
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
    // `session.freshAge` (default 86400s/24h, `context/create-context.mjs:148`) gates
    // better-auth's own `freshSessionMiddleware` — used by exactly one endpoint this
    // app calls: `GET /list-sessions` (`session.mjs:375-401`, the device list's real
    // data source, `useDeviceSessions.ts`). Found live: a session older than 24h but
    // still well inside its own 7-day `expiresIn` still passes `GET /v1/profile` and
    // `GET /get-session` (neither checks freshness) but 403s `list-sessions` with
    // `SESSION_NOT_FRESH` — a returning user who signed in yesterday can never see
    // their own "Angemeldete Geräte" list again without a fresh sign-in, and the
    // frontend's generic network-error copy (apps/mobile-web, Kaan's to fix) then
    // claims a connectivity problem that was never real.
    //
    // `revoke-session`/`revoke-sessions` do NOT use this gate (`sensitiveSessionMiddleware`,
    // `session.mjs:332-339` — a valid session, no freshness check) — so a device could
    // already be revoked on a stale session; only VIEWING the list was broken. That
    // asymmetry is better-auth's own, not introduced here.
    //
    // Set to 0 (disables the freshness check entirely, `session.mjs:365`/
    // `update-user.mjs:329`) rather than raised to some other number, because this app
    // does not use better-auth's own freshness concept for anything real: `/change-email`
    // and `/change-password` are not wired to any frontend screen (checked directly —
    // `grep -rn 'changeEmail\|change-password' apps/mobile-web/src apps/api/src` finds
    // nothing but comments), so `update-user.mjs`'s "skip password re-entry only if the
    // session is fresh" branch this would otherwise also gate is dead code in this
    // product today. The one genuinely destructive action this app has — `DELETE
    // /v1/account` (REQ-011/ADR-0013 §6) — was already built with its OWN, independent,
    // much shorter freshness window (`fresh-auth.ts`'s `ACCOUNT_DELETE_FRESH_WINDOW_MS`,
    // 5 minutes, not better-auth's `session.freshAge`) specifically because 24h is "sized
    // for routine sensitive-but-reversible actions", not an irreversible one — so nothing
    // here loses protection it actually had.
    //
    // Re-evaluation condition, stated rather than left implicit (ADR-0021 convention): if
    // `/change-email` or `/change-password` is ever wired to a real screen, this decision
    // must be revisited — either give that action its own fresh-auth-style window (mirroring
    // `fresh-auth.ts`) the way account deletion already does, or restore a non-zero
    // `freshAge` scoped so it no longer catches `list-sessions`.
    session: {
      freshAge: 0,
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
  // Mirrors `sessionConfig.expiresIn`'s exact default expression
  // (`context/create-context.mjs`) — we never set `session.expiresIn` ourselves, so
  // this is always the 7-day default today, but stays correct if that ever changes.
  const sessionExpiresInSeconds = authOptions.session?.expiresIn || 60 * 60 * 24 * 7
  return { auth, sessionCookieName, enabledSocialProviders, sessionExpiresInSeconds }
}
