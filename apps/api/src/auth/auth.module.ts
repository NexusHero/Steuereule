import { Global, Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { PrismaModule } from '../prisma/prisma.module.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { resolveCorsOrigins } from '../cors/resolve-cors-origins.js'
import { resolveTrustedProxies } from '../config/trusted-proxies.js'
import { BETTER_AUTH_BUNDLE } from './auth.tokens.js'
import { createBetterAuth } from './better-auth.js'
import { resolveAppleClientId, resolveAppleClientSecret, resolveAppleSignInEnabled, resolveBetterAuthSecret, resolveBetterAuthUrl, resolveGoogleClientId, resolveGoogleClientSecret, resolveWebAppUrl } from './better-auth-env.js'
import { BrevoEmailSender, resolveBrevoConfig } from './brevo-email-sender.js'
import { EMAIL_SENDER, type EmailSender } from './email-sender.js'
import { LoggingEmailSender } from './logging-email-sender.js'
import { resolveSmtpConfig, SmtpEmailSender } from './smtp-email-sender.js'
import { RequiresAccountGuard } from './requires-account.guard.js'
import { UserContextGuard } from './user-context.guard.js'
import { CSRF_TRUSTED_ORIGINS, OriginCsrfGuard } from './origin-csrf.guard.js'
import { mergeTrustedOrigins } from './trusted-origins.js'
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
      useFactory: (): EmailSender => {
        const smtp = resolveSmtpConfig()
        if (smtp) return new SmtpEmailSender(smtp)
        const brevo = resolveBrevoConfig()
        return brevo ? new BrevoEmailSender(brevo) : new LoggingEmailSender()
      },
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
    // The one trusted-origin allowlist, shared with better-auth's own origin check (ADR-0012 §5, ADR-0103).
    { provide: CSRF_TRUSTED_ORIGINS, useFactory: () => mergeTrustedOrigins(resolveCorsOrigins(), resolveWebAppUrl()) },
    // Global origin-based CSRF for the `/v1` controllers (ADR-0103 vulnerability 1).
    { provide: APP_GUARD, useClass: OriginCsrfGuard },
    UserContextGuard,
    RequiresAccountGuard,
  ],
  exports: [BETTER_AUTH_BUNDLE, EMAIL_SENDER, BEARER_TOKEN_REPOSITORY, UserContextGuard, RequiresAccountGuard, PrismaModule],
})
export class AuthModule {}
