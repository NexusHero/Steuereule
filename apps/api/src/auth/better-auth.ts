import { Logger } from '@nestjs/common'
import type { PrismaClient } from '@prisma/client'
import { prismaAdapter } from '@better-auth/prisma-adapter'
import { passkey } from '@better-auth/passkey'
import { oauthProvider } from '@better-auth/oauth-provider'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { isAcceptableClientName, MAX_CLIENT_NAME_LENGTH } from './oauth-client-name.js'
import { authIssuer, mcpResourceUrls } from './mcp-oauth.js'
import { ensureMcpResource, type ResourceAdapter } from './mcp-resource-seed.js'
import { sweepUnusedClients, type SweepAdapter } from './oauth-client-sweep.js'
import { betterAuth, type Auth, type BetterAuthOptions } from 'better-auth'
import { getCookies } from 'better-auth/cookies'
import { deviceAuthorization, haveIBeenPwned, jwt, twoFactor } from 'better-auth/plugins'
import { hibpFailOpenPlugin } from './breach-check.js'
import { redirectVerificationToWebApp } from './verification-link.js'
import { removedAccountRedirect } from './removed-account-link.js'
import { DEVICE_AUTHORIZATION_DISABLED_PATHS, assertDeviceAuthorizationDisabledPathsComplete } from './device-authorization-paths.js'
import { deviceSessionCookiePlugin } from './device-session-cookie.js'
import type { EmailSender } from './email-sender.js'
import { createGuestAccountUpgradeHook, type ReceiptFileMover } from './guest-account-upgrade.prisma.js'
import { createResettableRateLimitStorage, type ResettableRateLimitStorage } from './rate-limit-storage.js'
import { mergeTrustedOrigins } from './trusted-origins.js'
import { SESSION_IDLE_EXPIRES_IN_SECONDS, SESSION_UPDATE_AGE_SECONDS } from './session-lifetime.js'
import { forceRevokeOtherSessionsOnPasswordChange } from './force-session-rotation.js'
import { capSessionUpdateExpiry } from './session-absolute-cap.js'
import { withoutProviderTokens } from './provider-tokens.js'
import { sessionListRedactionPlugin } from './session-list-redaction.js'
import { CLIENT_IP_HEADER } from './client-ip.js'
import { revokeOauthGrantsOnPasswordChangePlugin, stepUpPlugin } from './step-up.js'
import { enforceAccountSignInLimit, enforceVerifyPasswordAccountLimit } from './account-sign-in-limit.js'
import {
  PASSWORD_RESET_ADDRESS_RULE,
  PASSWORD_RESET_TOKEN_TTL_SECONDS,
  REQUEST_PASSWORD_RESET_PATH,
  RESET_PASSWORD_RULE,
  enforcePasswordResetRequest,
  restrictResetLinkToWebApp,
} from './password-reset.js'
import { OAUTH_GRANT_MODELS } from './step-up.js'
import { ASSISTANT_SCOPES, LEGACY_PAYMENT_SCOPE } from '../common/assistant-scopes.js'

const resetMailLogger = new Logger('PasswordReset')
const signUpMailLogger = new Logger('SignUpMail')

/** Every scope the authorization server knows: sign-in, the assistant scopes of the MCP gate, refresh. */
export const OAUTH_SCOPES = [
  'openid',
  ...ASSISTANT_SCOPES,
  // The name before beta P4. Kept so grants made with it (their refresh tokens carry it) still refresh; the MCP
  // gate accepts it for zahllink_anfordern, and the discovery no longer offers it (DEPRECATED_OAUTH_SCOPES).
  LEGACY_PAYMENT_SCOPE,
  // Refresh tokens for the assistant: access tokens last 15 minutes, the connection until revoked (ADR-0052 §10).
  'offline_access',
] as const

export type OAuthScope = (typeof OAUTH_SCOPES)[number]

/** Scopes still honoured but no longer offered to new clients. */
export const DEPRECATED_OAUTH_SCOPES: readonly OAuthScope[] = [LEGACY_PAYMENT_SCOPE]

/** What the protected-resource metadata offers: every scope except the deprecated ones. */
export const ADVERTISED_OAUTH_SCOPES: readonly OAuthScope[] = OAUTH_SCOPES.filter((scope) => !DEPRECATED_OAUTH_SCOPES.includes(scope))

export const SESSION_COOKIE_ATTRIBUTES = {
  httpOnly: true,
  sameSite: 'none' as const,
  secure: true,
  path: '/',
}

/**
 * Self-registration of an MCP client (ADR-0052 amendment 7). A hosted assistant such as Claude.ai registers
 * from its own servers, so all its users share a few addresses: the limit is per address, not per person,
 * and must let a crowd of them in. A registration grants nothing, and one nobody approved is swept after a
 * week, so the limit only keeps the table from being flooded.
 */
export const OAUTH_REGISTRATION_RATE_LIMIT = { window: 10 * 60, max: 100 } as const

export interface CreateBetterAuthOptions {
  prisma: PrismaClient
  secret: string
  baseUrl: string
  trustedOrigins: string[]
  emailSender: EmailSender
  webAppUrl: string
  googleClientId?: string | undefined
  googleClientSecret?: string | undefined
  appleSignInEnabled?: boolean
  appleClientId?: string | undefined
  appleClientSecret?: string | undefined
  rateLimitStorage?: ResettableRateLimitStorage
  /** Called on a sign-in or sign-up: traffic the guest-retention sweep rides on (ADR-0109). */
  onSweepOpportunity?: () => void
  /** Re-encrypts a guest's receipt files for the account at the takeover (API-20). */
  receiptFiles?: ReceiptFileMover
}

export interface BetterAuthBundle {
  auth: Auth
  sessionCookieName: string
  enabledSocialProviders: readonly string[]
  rateLimitStorage: ResettableRateLimitStorage
}

function buildOptions(options: CreateBetterAuthOptions & { rateLimitStorage: ResettableRateLimitStorage }): BetterAuthOptions {
  const {
    prisma,
    secret,
    baseUrl,
    trustedOrigins,
    emailSender,
    webAppUrl,
    googleClientId,
    googleClientSecret,
    appleSignInEnabled,
    appleClientId,
    appleClientSecret,
    rateLimitStorage,
    onSweepOpportunity,
    receiptFiles,
  } = options

  const socialProviders: NonNullable<BetterAuthOptions['socialProviders']> = {}
  if (googleClientId && googleClientSecret) {
    socialProviders.google = {
      clientId: googleClientId,
      clientSecret: googleClientSecret,
    }
  }
  if (appleSignInEnabled && appleClientId && appleClientSecret) {
    socialProviders.apple = {
      clientId: appleClientId,
      clientSecret: appleClientSecret,
    }
  }

  const deviceAuthorizationPlugin = deviceAuthorization({ expiresIn: '2m', verificationUri: `${webAppUrl}/device` })
  assertDeviceAuthorizationDisabledPathsComplete(deviceAuthorizationPlugin)

  // Both transports of the MCP endpoint are resources a client may ask a token for (ADR-0052 amendment 6).
  const ensureResources = mcpResourceUrls(baseUrl).map((identifier) => ensureMcpResource(identifier, OAUTH_SCOPES))
  const sweepClients = sweepUnusedClients()

  return {
    baseURL: baseUrl,
    secret,
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    trustedOrigins: mergeTrustedOrigins(trustedOrigins, webAppUrl),
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      // Sign-up must not tell whether an address has an account (ADR-0109): a taken address answers exactly
      // like a free one, so sign-up cannot return a session, and an unverified account cannot sign in (else
      // sign-in right after sign-up would be the oracle). The guest keeps working meanwhile; its data moves
      // to the account on the first verified sign-in (ADR-0012 hook). No auto sign-in on the verification
      // link either: whoever clicks it may not be who chose the password.
      requireEmailVerification: true,
      // Taken address: the owner is told by mail, the requester sees the same answer as for a new address.
      onExistingUserSignUp: async ({ user }) => {
        try {
          await emailSender.sendExistingAccountNotice({
            to: user.email,
            subject: 'Jemand hat versucht, sich mit deiner Adresse zu registrieren — SteuerEule',
            url: `${webAppUrl}/login`,
          })
        } catch (error) {
          signUpMailLogger.error(`Existing-account notice not sent: ${String(error)}`)
        }
      },
      // ADR-0103 vulnerability 4: 12, not 8 — paired with the Have I Been Pwned breach check (ADR-0012 §5).
      minPasswordLength: 12,
      // Password reset by e-mail (ADR-0109). The request answers the same for any address; a failed send is
      // logged and swallowed so an unknown address and a mail outage look alike from outside.
      resetPasswordTokenExpiresIn: PASSWORD_RESET_TOKEN_TTL_SECONDS,
      sendResetPassword: async ({ user, url, token }) => {
        try {
          await emailSender.sendPasswordResetEmail({
            to: user.email,
            subject: 'Passwort zurücksetzen — SteuerEule',
            url: restrictResetLinkToWebApp(url, webAppUrl),
            token,
          })
        } catch (error) {
          resetMailLogger.error(`Password reset mail not sent: ${String(error)}`)
        }
      },
      // Whoever knew the old password may have been the attacker: every session ends ...
      revokeSessionsOnPasswordReset: true,
      // ... and so does every assistant connection, as with a password change (ADR-0106 D2).
      onPasswordReset: async ({ user }) => {
        for (const model of OAUTH_GRANT_MODELS) {
          await (prisma as unknown as Record<string, { deleteMany(args: { where: { userId: string } }): Promise<unknown> }>)[model]!.deleteMany({ where: { userId: user.id } })
        }
      },
    },
    socialProviders,
    emailVerification: {
      sendOnSignUp: true,
      // An account that exists but was never verified (older ones, ADR-0030) gets a fresh link when it tries
      // to sign in with the right password, instead of a dead end.
      sendOnSignIn: true,
      sendVerificationEmail: async ({ user, url, token }) => {
        // A failed send is logged and swallowed: a mail outage must not make a free address answer 500 while a
        // taken one answers 200 (ADR-0109).
        try {
          await emailSender.sendVerificationEmail({
            to: user.email,
            subject: 'Bitte bestätige deine E-Mail-Adresse — SteuerEule',
            url: redirectVerificationToWebApp(url, webAppUrl),
            token,
          })
        } catch (error) {
          signUpMailLogger.error(`Verification mail not sent: ${String(error)}`)
        }
      },
    },
    plugins: [
      haveIBeenPwned(),
      hibpFailOpenPlugin,
      deviceAuthorizationPlugin,
      deviceSessionCookiePlugin,
      twoFactor({ issuer: 'SteuerEule' }),
      passkey({ rpName: 'SteuerEule' }),
      // Passkey, assistant consent and social linking need a fresh sign-in or a re-entered password (ADR-0106 D2).
      stepUpPlugin,
      revokeOauthGrantsOnPasswordChangePlugin,
      // The device list gets no session tokens (WEB-22).
      sessionListRedactionPlugin,
      // The private key is stored encrypted under BETTER_AUTH_SECRET (the default): a database read alone no
      // longer lets anyone sign assistant tokens for any user (ADR-0106 D6).
      jwt({
        // One issuer for signing, the authorization-server metadata and our bearer check (ADR-0052 §2).
        jwt: { issuer: authIssuer(baseUrl) },
        // Off: the hook signed a token on every `getSession` (one per guarded request: a key read, a decrypt,
        // an EdDSA signature) for a `set-auth-jwt` header no client reads (OPS-4). Assistant tokens come
        // from the OAuth provider and are not affected.
        disableSettingJwtHeader: true,
      }),
      oauthProvider({
        scopes: [...OAUTH_SCOPES],
        accessTokenExpiresIn: 15 * 60,
        requirePKCE: true,
        allowDynamicClientRegistration: true,
        // An MCP client registers itself before the user signs in (RFC 7591), as assistants do: the user
        // pastes the server address and nothing else. Registration grants nothing; it is rate-limited per
        // address, and a client nobody approved is swept after a week (ADR-0052 amendment 5).
        allowUnauthenticatedClientRegistration: true,
        // MCP clients on the user's machine register a loopback redirect without `application_type`:
        // such a client is native (RFC 8252), one with an https redirect stays a web client.
        clientRegistrationDefaultApplicationType: 'infer',
        // A client may ask a token for every enabled resource; the one resource is the MCP endpoint. Linking
        // clients one by one would need the static `resources` option, which seeds while the app boots.
        enforcePerClientResources: false,
        consentPage: `${webAppUrl}/oauth/consent`,
        loginPage: `${webAppUrl}/login`,
      }),
    ],
    disabledPaths: DEVICE_AUTHORIZATION_DISABLED_PATHS,
    rateLimit: {
      enabled: true,
      customStorage: rateLimitStorage,
      customRules: {
        '/verify-password': { window: 10, max: 3 },
        '/device': { window: 60, max: 10 },
        '/oauth2/register': OAUTH_REGISTRATION_RATE_LIMIT,
        [REQUEST_PASSWORD_RESET_PATH]: PASSWORD_RESET_ADDRESS_RULE,
        '/reset-password': RESET_PASSWORD_RULE,
      },
    },
    advanced: {
      defaultCookieAttributes: SESSION_COOKIE_ATTRIBUTES,
      useSecureCookies: new URL(baseUrl).protocol === 'https:',
      disableOriginCheck: false,
      // The address Fastify resolved from the socket and TRUSTED_PROXIES, written by the server alone
      // (installClientIpHeader). It is a single, already-resolved value, so no proxy list applies here
      // (ADR-0106 D3/D4).
      ipAddress: {
        ipAddressHeaders: [CLIENT_IP_HEADER],
      },
    },
    session: {
      // freshAge stays 0 — the device list depends on it (ADR-0027). expiresIn/updateAge are the sliding
      // idle window; the absolute cap from creation is enforced in UserContextGuard (ADR-0103).
      freshAge: 0,
      expiresIn: SESSION_IDLE_EXPIRES_IN_SECONDS,
      updateAge: SESSION_UPDATE_AGE_SECONDS,
    },
    hooks: {
      // The MCP endpoint is the protected resource a client asks a token for (RFC 8707). Created on the
      // first OAuth request, not via the plugin's `resources` option, which seeds while the app boots.
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path.startsWith('/oauth2/')) await Promise.all(ensureResources.map((ensure) => ensure(ctx.context.adapter as unknown as ResourceAdapter)))
        if (ctx.path === '/oauth2/register') {
          // The name a client picks stands on the consent screen and every origin line: bounded (MCP-13).
          if (!isAcceptableClientName((ctx.body as { client_name?: unknown } | undefined)?.client_name)) {
            throw new APIError('BAD_REQUEST', { error: 'invalid_client_metadata', error_description: `client_name must be a string of at most ${MAX_CLIENT_NAME_LENGTH} characters.` })
          }
          await sweepClients(ctx.context.adapter as unknown as SweepAdapter)
        }
        if (ctx.path === '/sign-in/email' || ctx.path === '/sign-up/email') onSweepOpportunity?.()
        if (ctx.path === '/verify-email') {
          // ADR-0030 §5: the link of a removed account says so instead of "expired".
          const removed = await removedAccountRedirect(ctx.query ?? {}, ctx.context.secret, webAppUrl, async (email) => (await ctx.context.internalAdapter.findUserByEmail(email)) !== null)
          if (removed) throw ctx.redirect(removed)
        }
        await enforceAccountSignInLimit(rateLimitStorage, ctx.path, ctx.body)
        await enforcePasswordResetRequest(rateLimitStorage, ctx.path, ctx.body, webAppUrl)
        await enforceVerifyPasswordAccountLimit(rateLimitStorage, ctx)
        // A password change always rotates the current token and revokes the account's other sessions,
        // whatever the client sent (ADR-0103 vulnerability 3): force better-auth's own flag on.
        const rotation = forceRevokeOtherSessionsOnPasswordChange(ctx.path, ctx.body)
        if (rotation) return rotation
      }),
    },
    databaseHooks: {
      // Provider tokens are not stored (API-18): every account write drops them.
      account: {
        create: { before: async (account) => withoutProviderTokens(account) },
        update: { before: async (account) => withoutProviderTokens(account) },
      },
      session: {
        create: {
          after: createGuestAccountUpgradeHook(prisma, receiptFiles),
        },
        update: {
          // Enforce the absolute cap at the better-auth boundary too (ADR-0103 vulnerability 2): clamp every
          // expiry slide to createdAt + cap, so a stolen, actively-used cookie dies on every route, not only
          // on `/v1` (which UserContextGuard already refuses). The mounted handler bypasses that guard.
          before: async (data, context) => capSessionUpdateExpiry(data, context),
        },
      },
    },
  }
}

export function createBetterAuth(options: CreateBetterAuthOptions): BetterAuthBundle {
  const rateLimitStorage = options.rateLimitStorage ?? createResettableRateLimitStorage()
  const authOptions = buildOptions({ ...options, rateLimitStorage })
  const auth = betterAuth(authOptions)
  const sessionCookieName = getCookies(authOptions).sessionToken.name
  const enabledSocialProviders = Object.keys(authOptions.socialProviders ?? {})
  return { auth, sessionCookieName, enabledSocialProviders, rateLimitStorage }
}
