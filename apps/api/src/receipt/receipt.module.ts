import { Module } from '@nestjs/common'
import { AdvisorModule } from '../advisor/advisor.module.js'
import { AuditModule } from '../audit/audit.module.js'
import { KiModule } from '../ki/ki.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { AutoReceiptParseStrategy } from './parse/auto-receipt-parse.strategy.js'
import { DocumentParseRegistry } from './parse/document-parse.registry.js'
import { ReceiptParseController } from './receipt-parse.controller.js'
import { ReceiptParseService } from './receipt-parse.service.js'
import { ReceiptStorageModule } from './receipt-storage.module.js'
import { ReceiptController } from './receipt.controller.js'
import { ReceiptService } from './receipt.service.js'

@Module({
  imports: [PrismaModule, ReceiptStorageModule, AuditModule, KiModule, AdvisorModule],
  controllers: [ReceiptController, ReceiptParseController],
  providers: [ReceiptService, ReceiptParseService, DocumentParseRegistry, AutoReceiptParseStrategy],
  exports: [ReceiptStorageModule, ReceiptService, DocumentParseRegistry],
})
export class ReceiptModule {}
