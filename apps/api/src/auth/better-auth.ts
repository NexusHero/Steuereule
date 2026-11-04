import type { PrismaClient } from '@prisma/client'
import { prismaAdapter } from '@better-auth/prisma-adapter'
import { passkey } from '@better-auth/passkey'
import { oauthProvider } from '@better-auth/oauth-provider'
import { betterAuth, type Auth, type BetterAuthOptions } from 'better-auth'
import { getCookies } from 'better-auth/cookies'
import { deviceAuthorization, haveIBeenPwned, jwt, twoFactor } from 'better-auth/plugins'
import { hibpFailOpenPlugin } from './breach-check.js'
import { DEVICE_AUTHORIZATION_DISABLED_PATHS, assertDeviceAuthorizationDisabledPathsComplete } from './device-authorization-paths.js'
import { deviceSessionCookiePlugin } from './device-session-cookie.js'
import type { EmailSender } from './email-sender.js'
import { createGuestAccountUpgradeHook } from './guest-account-upgrade.js'
import { createResettableRateLimitStorage, type ResettableRateLimitStorage } from './rate-limit-storage.js'

export const OAUTH_SCOPES = [
  'openid',
  'steuerdaten:read',
  'steuerdaten:write',
  'belege:write',
  'zahllink:read',
] as const

export type OAuthScope = (typeof OAUTH_SCOPES)[number]

export const SESSION_COOKIE_ATTRIBUTES = {
  httpOnly: true,
  sameSite: 'none' as const,
  secure: true,
  path: '/',
}

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

  return {
    baseURL: baseUrl,
    secret,
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    trustedOrigins,
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
          url,
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
      }),
      oauthProvider({
        scopes: [...OAUTH_SCOPES],
        accessTokenExpiresIn: 15 * 60,
        requirePKCE: true,
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
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
      },
    },
    advanced: {
      defaultCookieAttributes: SESSION_COOKIE_ATTRIBUTES,
      useSecureCookies: true,
      disableOriginCheck: false,
      ipAddress: {
        trustedProxies,
      },
    },
    session: {
      freshAge: 0,
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
