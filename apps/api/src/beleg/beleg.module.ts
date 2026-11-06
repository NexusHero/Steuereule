import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { ReceiptController } from './beleg.controller.js'
import { RECEIPT_REPOSITORY } from './beleg.repository.js'
import { PrismaReceiptRepository } from './beleg.repository.prisma.js'
import { ReceiptService } from './beleg.service.js'

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [ReceiptController],
  providers: [ReceiptService, { provide: RECEIPT_REPOSITORY, useClass: PrismaReceiptRepository }],
  exports: [RECEIPT_REPOSITORY, ReceiptService],
})
export class ReceiptModule {}
