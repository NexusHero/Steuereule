import { Module } from '@nestjs/common'
import { AdvisorModule } from '../advisor/advisor.module.js'
import { AuditModule } from '../audit/audit.module.js'
import { KiModule } from '../ki/ki.module.js'
import { LinkModule } from '../link/link.module.js'
import { ReceiptModule } from '../receipt/receipt.module.js'
import { ChCertificateScanParseStrategy } from './ch-certificate-scan.parse-strategy.js'

/**
 * Reading the Swiss salary certificate from an upload. Registers its strategy in the receipt module's
 * registry; none of the modules it uses depends on it.
 */
@Module({
  imports: [AuditModule, KiModule, LinkModule, ReceiptModule, AdvisorModule],
  providers: [ChCertificateScanParseStrategy],
})
export class ChCertificateScanModule {}
