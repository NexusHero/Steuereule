import { Module } from '@nestjs/common'
import { AdvisorDataModule } from '../advisor/advisor-data.module.js'
import { AuditModule } from '../audit/audit.module.js'
import { LinkModule } from '../link/link.module.js'
import { MarkingModule } from '../marking/marking.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { ReceiptStorageModule } from '../receipt/receipt-storage.module.js'
import { LstbController } from './lstb.controller.js'
import { LstbDataModule } from './lstb-data.module.js'
import { LstbService } from './lstb.service.js'

@Module({
  imports: [
    LstbDataModule,
    MarkingModule,
    PrismaModule,
    AuditModule,
    LinkModule,
    ReceiptStorageModule,
    AdvisorDataModule,
  ],
  controllers: [LstbController],
  providers: [LstbService],
  exports: [LstbDataModule, LstbService],
})
export class LstbModule {}
