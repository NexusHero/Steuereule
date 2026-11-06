import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { ProfileModule } from '../profile/profile.module.js'
import { MasterDataModule } from '../stammdaten/stammdaten.module.js'
import { LinkController } from './kopplung.controller.js'
import { LinkService } from './kopplung.service.js'
import { PARTNER_COUPLING_REPOSITORY } from './kopplung.repository.js'
import { PrismaLinkRepository } from './kopplung.repository.prisma.js'

@Module({
  imports: [PrismaModule, AuditModule, ProfileModule, MasterDataModule],
  controllers: [LinkController],
  providers: [
    LinkService,
    {
      provide: PARTNER_COUPLING_REPOSITORY,
      useClass: PrismaLinkRepository,
    },
  ],
  exports: [LinkService, PARTNER_COUPLING_REPOSITORY],
})
export class LinkModule {}
