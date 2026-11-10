import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { ProfileModule } from '../profile/profile.module.js'
import { MasterDataModule } from '../master-data/master-data.module.js'
import { HouseholdCoreModule } from '../household/household-core.module.js'
import { LinkController } from './link.controller.js'
import { LinkService } from './link.service.js'
import { PARTNER_COUPLING_REPOSITORY } from './link.repository.js'
import { PrismaLinkRepository } from './link.repository.prisma.js'

@Module({
  imports: [PrismaModule, AuditModule, ProfileModule, MasterDataModule, HouseholdCoreModule],
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
