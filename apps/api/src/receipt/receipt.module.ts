import { Module } from '@nestjs/common'
import { AdvisorModule } from '../advisor/advisor.module.js'
import { AuditModule } from '../audit/audit.module.js'
import { KiModule } from '../ki/ki.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { ReceiptParseController } from './receipt-parse.controller.js'
import { ReceiptParseService } from './receipt-parse.service.js'
import { ReceiptController } from './receipt.controller.js'
import { RECEIPT_REPOSITORY } from './receipt.repository.js'
import { PrismaReceiptRepository } from './receipt.repository.prisma.js'
import { ReceiptService } from './receipt.service.js'

@Module({
  imports: [PrismaModule, AuditModule, KiModule, AdvisorModule],
  controllers: [ReceiptController, ReceiptParseController],
  providers: [
    ReceiptService,
    ReceiptParseService,
    { provide: RECEIPT_REPOSITORY, useClass: PrismaReceiptRepository },
  ],
  exports: [RECEIPT_REPOSITORY, ReceiptService, ReceiptParseService],
})
export class ReceiptModule {}
