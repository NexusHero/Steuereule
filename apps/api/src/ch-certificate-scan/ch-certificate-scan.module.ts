import { Module } from '@nestjs/common'
import { AdvisorModule } from '../advisor/advisor.module.js'
import { AuditModule } from '../audit/audit.module.js'
import { KiModule } from '../ki/ki.module.js'
import { LinkModule } from '../link/link.module.js'
import { ReceiptModule } from '../receipt/receipt.module.js'
import { ChSalaryCertificateModule } from '../ch-salary-certificate/ch-salary-certificate.module.js'
import { ChCertificateScanParseStrategy } from './ch-certificate-scan.parse-strategy.js'
import { ChPensionStatementParseStrategy, ChPremiumLetterParseStrategy } from './ch-letter.parse-strategy.js'

/**
 * Reading the Swiss salary certificate, the pension fund's statement and the employer's premium
 * letter from an upload. Registers its strategy in the receipt module's
 * registry; none of the modules it uses depends on it.
 */
@Module({
  imports: [AuditModule, KiModule, LinkModule, ReceiptModule, AdvisorModule, ChSalaryCertificateModule],
  providers: [ChCertificateScanParseStrategy, ChPensionStatementParseStrategy, ChPremiumLetterParseStrategy],
})
export class ChCertificateScanModule {}
