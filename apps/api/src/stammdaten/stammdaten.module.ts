import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { MasterDataController } from './stammdaten.controller.js'
import { MASTER_DATA_REPOSITORY } from './stammdaten.repository.js'
import { PrismaMasterDataRepository } from './stammdaten.repository.prisma.js'
import { MasterDataService } from './stammdaten.service.js'

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [MasterDataController],
  providers: [MasterDataService, { provide: MASTER_DATA_REPOSITORY, useClass: PrismaMasterDataRepository }],
  exports: [MASTER_DATA_REPOSITORY],
})
export class MasterDataModule {}
