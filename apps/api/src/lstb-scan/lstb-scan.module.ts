import { Module } from '@nestjs/common'
import { AdvisorModule } from '../advisor/advisor.module.js'
import { AuditModule } from '../audit/audit.module.js'
import { KiModule } from '../ki/ki.module.js'
import { LinkModule } from '../link/link.module.js'
import { LstbModule } from '../lstb/lstb.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { ReceiptModule } from '../receipt/receipt.module.js'
import { LstbScanController } from './lstb-scan.controller.js'
import { LstbScanParseStrategy } from './lstb-scan.parse-strategy.js'
import { LstbScanService } from './lstb-scan.service.js'

/**
 * LStB scan & pre-fill (#444). Orchestrates the receipt, LStB and advisor modules through their
 * public services; none of them depends on this module (dependencies point inwards only).
 */
@Module({
  imports: [PrismaModule, AuditModule, KiModule, LinkModule, LstbModule, ReceiptModule, AdvisorModule],
  controllers: [LstbScanController],
  providers: [LstbScanService, LstbScanParseStrategy],
})
export class LstbScanModule {}
