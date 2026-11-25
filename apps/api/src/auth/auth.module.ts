import { Global, Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { PrismaGuestActivityRepository } from '../guest/guest-activity.repository.prisma.js'
import { GUEST_ACTIVITY_RECORDER, GuestActivityNotes } from '../guest/guest-retention.js'
import { systemDatabaseClient } from '../common/database-identity.js'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { resolveCorsOrigins } from '../cors/resolve-cors-origins.js'
import { BETTER_AUTH_BUNDLE } from './auth.tokens.js'
import { createBetterAuth } from './better-auth.js'
import { resolveAppleClientId, resolveAppleClientSecret, resolveAppleSignInEnabled, resolveBetterAuthSecret, resolveBetterAuthUrl, resolveGoogleClientId, resolveGoogleClientSecret, resolveWebAppUrl } from './better-auth-env.js'
import { EMAIL_SENDER, type EmailSender } from './email-sender.js'
import { createEmailSender } from './email-sender.factory.js'
import { RequiresAccountGuard } from './requires-account.guard.js'
import { UserContextGuard } from './user-context.guard.js'
import { CSRF_TRUSTED_ORIGINS, OriginCsrfGuard } from './origin-csrf.guard.js'
import { mergeTrustedOrigins } from './trusted-origins.js'
import { BEARER_TOKEN_REPOSITORY } from './bearer-token.repository.js'
import { PrismaBearerTokenRepository } from './bearer-token.repository.prisma.js'
import { AuthCapabilitiesController } from './auth-capabilities.controller.js'
import { OAuthDiscoveryController } from './oauth-discovery.controller.js'
import { ReceiptStorageModule } from '../receipt/receipt-storage.module.js'
import { PostgresByteaStorageAdapter } from '../receipt/storage/postgres-bytea-storage.adapter.js'

/** The auth wiring seam: builds the one shared better-auth instance off the existing PrismaService connection. */
@Global()
@Module({
  imports: [PrismaModule, ReceiptStorageModule],
  controllers: [AuthCapabilitiesController, OAuthDiscoveryController],
  providers: [
    {
      provide: EMAIL_SENDER,
      // Fails closed in production if no real provider is configured (ADR-0104 M1).
      useFactory: (): EmailSender => createEmailSender(),
    },
    // The retention clock of guests (ADR-0109); the sweep that reads it lives in AccountModule.
    { provide: GUEST_ACTIVITY_RECORDER, inject: [PrismaService], useFactory: (prisma: PrismaService) => new GuestActivityNotes(new PrismaGuestActivityRepository(prisma)) },
    {
      provide: BETTER_AUTH_BUNDLE,
      // The encrypted client: name, e-mail and session address are ciphertext at rest (ADR-0109).
      inject: [ENCRYPTED_PRISMA, EMAIL_SENDER, GUEST_ACTIVITY_RECORDER, PostgresByteaStorageAdapter],
      useFactory: (prisma: EncryptedPrismaClient, emailSender: EmailSender, recorder: GuestActivityNotes, receiptFiles: PostgresByteaStorageAdapter) =>
        createBetterAuth({
          // better-auth's adapter and hooks look rows up across accounts (e-mail hash, session token): a system path (P11).
          prisma: systemDatabaseClient(prisma, 'better-auth'),
          secret: resolveBetterAuthSecret(),
          baseUrl: resolveBetterAuthUrl(),
          trustedOrigins: resolveCorsOrigins(),
          webAppUrl: resolveWebAppUrl(),
          emailSender,
          // A sign-in or sign-up is traffic too: it gives the guest sweep a chance to run (ADR-0029, ADR-0109).
          onSweepOpportunity: () => recorder.seen(),
          // A guest's receipt files are re-encrypted for the account at the first sign-in (API-20).
          receiptFiles,
          googleClientId: resolveGoogleClientId(),
          googleClientSecret: resolveGoogleClientSecret(),
          appleSignInEnabled: resolveAppleSignInEnabled(),
          appleClientId: resolveAppleClientId(),
          appleClientSecret: resolveAppleClientSecret(),
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
  exports: [GUEST_ACTIVITY_RECORDER, BETTER_AUTH_BUNDLE, EMAIL_SENDER, BEARER_TOKEN_REPOSITORY, UserContextGuard, RequiresAccountGuard, PrismaModule],
})
export class AuthModule {}
