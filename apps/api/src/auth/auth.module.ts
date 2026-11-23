import { Global, Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { resolveCorsOrigins } from '../cors/resolve-cors-origins.js'
import { resolveTrustedProxies } from '../config/trusted-proxies.js'
import { BETTER_AUTH_BUNDLE } from './auth.tokens.js'
import { createBetterAuth } from './better-auth.js'
import { resolveAppleClientId, resolveAppleClientSecret, resolveAppleSignInEnabled, resolveBetterAuthSecret, resolveBetterAuthUrl, resolveGoogleClientId, resolveGoogleClientSecret, resolveWebAppUrl } from './better-auth-env.js'
import { EMAIL_SENDER, type EmailSender } from './email-sender.js'
import { createEmailSender } from './email-sender.factory.js'
import { RequiresAccountGuard } from './requires-account.guard.js'
import { UserContextGuard } from './user-context.guard.js'
import { BEARER_TOKEN_REPOSITORY } from './bearer-token.repository.js'
import { PrismaBearerTokenRepository } from './bearer-token.repository.prisma.js'
import { AuthCapabilitiesController } from './auth-capabilities.controller.js'
import { OAuthDiscoveryController } from './oauth-discovery.controller.js'

/** The auth wiring seam: builds the one shared better-auth instance off the existing PrismaService connection. */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [AuthCapabilitiesController, OAuthDiscoveryController],
  providers: [
    {
      provide: EMAIL_SENDER,
      // Fails closed in production if no real provider is configured (ADR-0104 M1).
      useFactory: (): EmailSender => createEmailSender(),
    },
    {
      provide: BETTER_AUTH_BUNDLE,
      inject: [PrismaService, EMAIL_SENDER],
      useFactory: (prisma: PrismaService, emailSender: EmailSender) =>
        createBetterAuth({
          prisma,
          secret: resolveBetterAuthSecret(),
          baseUrl: resolveBetterAuthUrl(),
          trustedOrigins: resolveCorsOrigins(),
          webAppUrl: resolveWebAppUrl(),
          emailSender,
          googleClientId: resolveGoogleClientId(),
          googleClientSecret: resolveGoogleClientSecret(),
          appleSignInEnabled: resolveAppleSignInEnabled(),
          appleClientId: resolveAppleClientId(),
          appleClientSecret: resolveAppleClientSecret(),
          trustedProxies: resolveTrustedProxies(),
        }),
    },
    { provide: BEARER_TOKEN_REPOSITORY, useClass: PrismaBearerTokenRepository },
    UserContextGuard,
    RequiresAccountGuard,
  ],
  exports: [BETTER_AUTH_BUNDLE, EMAIL_SENDER, BEARER_TOKEN_REPOSITORY, UserContextGuard, RequiresAccountGuard, PrismaModule],
})
export class AuthModule {}
