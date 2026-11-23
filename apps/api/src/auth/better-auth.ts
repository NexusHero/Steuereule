import type { PrismaClient } from '@prisma/client'
import { prismaAdapter } from '@better-auth/prisma-adapter'
import { passkey } from '@better-auth/passkey'
import { oauthProvider } from '@better-auth/oauth-provider'
import { createAuthMiddleware } from 'better-auth/api'
import { authIssuer, mcpResourceUrls } from './mcp-oauth.js'
import { ensureMcpResource, type ResourceAdapter } from './mcp-resource-seed.js'
import { sweepUnusedClients, type SweepAdapter } from './oauth-client-sweep.js'
import { betterAuth, type Auth, type BetterAuthOptions } from 'better-auth'
import { getCookies } from 'better-auth/cookies'
import { deviceAuthorization, haveIBeenPwned, jwt, twoFactor } from 'better-auth/plugins'
import { hibpFailOpenPlugin } from './breach-check.js'
import { redirectVerificationToWebApp } from './verification-link.js'
import { DEVICE_AUTHORIZATION_DISABLED_PATHS, assertDeviceAuthorizationDisabledPathsComplete } from './device-authorization-paths.js'
import { deviceSessionCookiePlugin } from './device-session-cookie.js'
import type { EmailSender } from './email-sender.js'
import { createGuestAccountUpgradeHook } from './guest-account-upgrade.prisma.js'
import { createResettableRateLimitStorage, type ResettableRateLimitStorage } from './rate-limit-storage.js'

export const OAUTH_SCOPES = [
  'openid',
  'steuerdaten:read',
  'steuerdaten:write',
  'belege:write',
  'zahllink:read',
  // Refresh tokens for the assistant: access tokens last 15 minutes, the connection until revoked (ADR-0052 §10).
  'offline_access',
] as const

export type OAuthScope = (typeof OAUTH_SCOPES)[number]

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
  trustedProxies: string[]
  rateLimitStorage?: ResettableRateLimitStorage
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
    trustedProxies,
    rateLimitStorage,
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
    trustedOrigins: [...new Set([...trustedOrigins, new URL(webAppUrl).origin])],
    emailAndPassword: {
      enabled: true,
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
          url: redirectVerificationToWebApp(url, webAppUrl),
          token,
        })
      },
    },
    plugins: [
      haveIBeenPwned(),
      hibpFailOpenPlugin,
      deviceAuthorizationPlugin,
      deviceSessionCookiePlugin,
      twoFactor({ issuer: 'SteuerEule' }),
      passkey({ rpName: 'SteuerEule' }),
      jwt({
        jwks: {
          disablePrivateKeyEncryption: true,
        },
        // One issuer for signing, the authorization-server metadata and our bearer check (ADR-0052 §2).
        jwt: { issuer: authIssuer(baseUrl) },
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
      },
    },
    advanced: {
      defaultCookieAttributes: SESSION_COOKIE_ATTRIBUTES,
      useSecureCookies: new URL(baseUrl).protocol === 'https:',
      disableOriginCheck: false,
      ipAddress: {
        trustedProxies,
      },
    },
    session: {
      freshAge: 0,
    },
    hooks: {
      // The MCP endpoint is the protected resource a client asks a token for (RFC 8707). Created on the
      // first OAuth request, not via the plugin's `resources` option, which seeds while the app boots.
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path.startsWith('/oauth2/')) await Promise.all(ensureResources.map((ensure) => ensure(ctx.context.adapter as unknown as ResourceAdapter)))
        if (ctx.path === '/oauth2/register') await sweepClients(ctx.context.adapter as unknown as SweepAdapter)
      }),
    },
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
  const rateLimitStorage = options.rateLimitStorage ?? createResettableRateLimitStorage()
  const authOptions = buildOptions({ ...options, rateLimitStorage })
  const auth = betterAuth(authOptions)
  const sessionCookieName = getCookies(authOptions).sessionToken.name
  const enabledSocialProviders = Object.keys(authOptions.socialProviders ?? {})
  return { auth, sessionCookieName, enabledSocialProviders, rateLimitStorage }
}
