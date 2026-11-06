import { Module } from '@nestjs/common'
import { resolveWebAppUrl } from '../auth/better-auth-env.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { UnlockController } from './unlock.controller.js'
import { UNLOCK_REPOSITORY } from './unlock.repository.js'
import { PrismaUnlockRepository } from './unlock.repository.prisma.js'
import { UnlockService, WEB_APP_URL_TOKEN } from './unlock.service.js'
import { resolveStripeConfig, StripePaymentProvider } from './stripe-payment-provider.js'
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment-provider.js'

@Module({
  imports: [PrismaModule],
  controllers: [UnlockController],
  providers: [
    UnlockService,
    { provide: UNLOCK_REPOSITORY, useClass: PrismaUnlockRepository },
    {
      provide: PAYMENT_PROVIDER,
      useFactory: (): PaymentProvider | null => {
        const config = resolveStripeConfig()
        return config ? new StripePaymentProvider(config) : null
      },
    },
    { provide: WEB_APP_URL_TOKEN, useFactory: () => resolveWebAppUrl() },
  ],
  exports: [UnlockService],
})
export class UnlockModule {}
