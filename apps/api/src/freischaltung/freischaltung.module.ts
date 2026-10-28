import { Module } from '@nestjs/common'
import { resolveWebAppUrl } from '../auth/better-auth.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { FreischaltungController } from './freischaltung.controller.js'
import { FREISCHALTUNG_REPOSITORY } from './freischaltung.repository.js'
import { PrismaFreischaltungRepository } from './freischaltung.repository.prisma.js'
import { FreischaltungService, WEB_APP_URL_TOKEN } from './freischaltung.service.js'
import { resolveStripeConfig, StripeZahlungsanbieter } from './stripe-zahlungsanbieter.js'
import { ZAHLUNGSANBIETER, type Zahlungsanbieter } from './zahlungsanbieter.js'

@Module({
  imports: [PrismaModule],
  controllers: [FreischaltungController],
  providers: [
    FreischaltungService,
    { provide: FREISCHALTUNG_REPOSITORY, useClass: PrismaFreischaltungRepository },
    {
      provide: ZAHLUNGSANBIETER,
      useFactory: (): Zahlungsanbieter | null => {
        const config = resolveStripeConfig()
        return config ? new StripeZahlungsanbieter(config) : null
      },
    },
    { provide: WEB_APP_URL_TOKEN, useFactory: () => resolveWebAppUrl() },
  ],
  // The Ausdruck (next slice) gates its download on FreischaltungService.status().
  exports: [FreischaltungService],
})
export class FreischaltungModule {}
