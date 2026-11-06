import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { MasterDataController } from './master-data.controller.js'
import { MASTER_DATA_REPOSITORY } from './master-data.repository.js'
import { PrismaMasterDataRepository } from './master-data.repository.prisma.js'
import { MasterDataService } from './master-data.service.js'

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [MasterDataController],
  providers: [MasterDataService, { provide: MASTER_DATA_REPOSITORY, useClass: PrismaMasterDataRepository }],
  exports: [MASTER_DATA_REPOSITORY],
})
export class MasterDataModule {}
