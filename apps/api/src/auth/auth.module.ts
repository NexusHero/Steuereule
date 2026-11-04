import { Global, Module } from '@nestjs/common'
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
import { RequiresAccountGuard } from './requires-account.guard.js'
import { UserContextGuard } from './user-context.guard.js'
import { AuthCapabilitiesController } from './auth-capabilities.controller.js'

/** The auth wiring seam: builds the one shared better-auth instance off the existing PrismaService connection. */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [AuthCapabilitiesController],
  providers: [
    {
      provide: EMAIL_SENDER,
      useFactory: (): EmailSender => {
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
    UserContextGuard,
    RequiresAccountGuard,
  ],
  exports: [BETTER_AUTH_BUNDLE, EMAIL_SENDER, UserContextGuard, RequiresAccountGuard],
})
export class AuthModule {}
