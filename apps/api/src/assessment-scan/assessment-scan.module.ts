import { Module } from '@nestjs/common'
import { AdvisorModule } from '../advisor/advisor.module.js'
import { AssessmentModule } from '../assessment/assessment.module.js'
import { AuditModule } from '../audit/audit.module.js'
import { ReceiptModule } from '../receipt/receipt.module.js'
import { AssessmentNoticeParseStrategy } from './assessment-notice.parse-strategy.js'

/**
 * Reading the Steuerbescheid from an upload (ADR-0098 §4). Registers its strategy in the receipt
 * module's registry; none of the modules it uses depends on it.
 */
@Module({
  imports: [AuditModule, ReceiptModule, AdvisorModule, AssessmentModule],
  providers: [AssessmentNoticeParseStrategy],
})
export class AssessmentScanModule {}
