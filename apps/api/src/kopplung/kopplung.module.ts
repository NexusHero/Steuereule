import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { ProfileModule } from '../profile/profile.module.js'
import { StammdatenModule } from '../stammdaten/stammdaten.module.js'
import { KopplungController } from './kopplung.controller.js'
import { KopplungService } from './kopplung.service.js'
import { PARTNER_COUPLING_REPOSITORY } from './kopplung.repository.js'
import { PrismaKopplungRepository } from './kopplung.repository.prisma.js'

@Module({
  imports: [PrismaModule, AuditModule, ProfileModule, StammdatenModule],
  controllers: [KopplungController],
  providers: [
    KopplungService,
    {
      provide: PARTNER_COUPLING_REPOSITORY,
      useClass: PrismaKopplungRepository,
    },
  ],
  exports: [KopplungService, PARTNER_COUPLING_REPOSITORY],
})
export class KopplungModule {}
