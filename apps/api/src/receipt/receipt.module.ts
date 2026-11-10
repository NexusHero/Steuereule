import { Module } from '@nestjs/common'
import { AdvisorModule } from '../advisor/advisor.module.js'
import { AuditModule } from '../audit/audit.module.js'
import { KiModule } from '../ki/ki.module.js'
import { LinkModule } from '../link/link.module.js'
import { LstbDataModule } from '../lstb/lstb-data.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { ReceiptParseController } from './receipt-parse.controller.js'
import { ReceiptParseService } from './receipt-parse.service.js'
import { ReceiptStorageModule } from './receipt-storage.module.js'
import { ReceiptController } from './receipt.controller.js'
import { ReceiptService } from './receipt.service.js'

@Module({
  imports: [PrismaModule, ReceiptStorageModule, LstbDataModule, AuditModule, KiModule, AdvisorModule, LinkModule],
  controllers: [ReceiptController, ReceiptParseController],
  providers: [ReceiptService, ReceiptParseService],
  exports: [ReceiptStorageModule, ReceiptService, ReceiptParseService],
})
export class ReceiptModule {}
