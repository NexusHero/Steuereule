import { Module } from '@nestjs/common'
import { AdvisorModule } from '../advisor/advisor.module.js'
import { AuditModule } from '../audit/audit.module.js'
import { ReceiptModule } from '../receipt/receipt.module.js'
import { BusinessModule } from './business.module.js'
import { BusinessReceiptParseStrategy } from './business-receipt.parse-strategy.js'

/**
 * Business receipts into booking drafts (ADR-0101 §6). Its own module so the book does not depend on the
 * owl: it registers its strategy in the receipt module's registry, like the other document readers.
 */
@Module({
  imports: [AuditModule, ReceiptModule, AdvisorModule, BusinessModule],
  providers: [BusinessReceiptParseStrategy],
})
export class BusinessReceiptModule {}
