import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { ChildrenModule } from '../children/children.module.js'
import { LinkModule } from '../link/link.module.js'
import { MasterDataModule } from '../master-data/master-data.module.js'
import { ProfileModule } from '../profile/profile.module.js'
import { HouseholdController } from './household.controller.js'
import { HouseholdCoreModule } from './household-core.module.js'
import { HouseholdService } from './household.service.js'

@Module({
  imports: [HouseholdCoreModule, AuditModule, ChildrenModule, LinkModule, ProfileModule, MasterDataModule],
  controllers: [HouseholdController],
  providers: [HouseholdService],
  exports: [HouseholdService],
})
export class HouseholdModule {}
