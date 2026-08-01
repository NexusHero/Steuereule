// The auth wiring seam (ADR-0012 §1): builds the one shared better-auth instance
// (BETTER_AUTH_BUNDLE) off the existing PrismaService connection — never a second DB
// client — and provides UserContextGuard here so every feature module gets the same
// guard instance via DI (constructor-injected dependencies, not a bare `new`).
//
// @Global(): every future authenticated endpoint reuses UserContextGuard by importing
// nothing extra (`@UseGuards(UserContextGuard)` alone, exactly as ProfileController
// already does) — the whole point of the seam is that adding real login costs
// controllers/services nothing.
import { Global, Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { resolveCorsOrigins } from '../cors/resolve-cors-origins.js'
import { resolveTrustedProxies } from '../config/trusted-proxies.js'
import { BETTER_AUTH_BUNDLE } from './auth.tokens.js'
import { createBetterAuth, resolveBetterAuthSecret, resolveBetterAuthUrl, resolveGoogleClientId, resolveGoogleClientSecret } from './better-auth.js'
import { EMAIL_SENDER, type EmailSender } from './email-sender.js'
import { LoggingEmailSender } from './logging-email-sender.js'
import { UserContextGuard } from './user-context.guard.js'
import { AuthCapabilitiesController } from './auth-capabilities.controller.js'

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [AuthCapabilitiesController],
  providers: [
    { provide: EMAIL_SENDER, useClass: LoggingEmailSender },
    {
      provide: BETTER_AUTH_BUNDLE,
      inject: [PrismaService, EMAIL_SENDER],
      useFactory: (prisma: PrismaService, emailSender: EmailSender) =>
        createBetterAuth({
          prisma,
          secret: resolveBetterAuthSecret(),
          baseUrl: resolveBetterAuthUrl(),
          // Same allowlist CORS uses (ADR-0011/ADR-0012 §5) — one source of truth for
          // "who is allowed to call us cross-origin", never a second, drifting copy.
          trustedOrigins: resolveCorsOrigins(),
          emailSender,
          // Google OAuth (REQ-008): credentials from env, dev-only fallback outside prod.
          googleClientId: resolveGoogleClientId(),
          googleClientSecret: resolveGoogleClientSecret(),
          // #241: which reverse-proxy hops to trust when reading X-Forwarded-For —
          // governs Session.ipAddress and better-auth's own built-in rate limiter.
          trustedProxies: resolveTrustedProxies(),
        }),
    },
    UserContextGuard,
  ],
  exports: [BETTER_AUTH_BUNDLE, EMAIL_SENDER, UserContextGuard],
})
export class AuthModule {}
