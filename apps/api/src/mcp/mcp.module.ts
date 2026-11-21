import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module.js'
import { AuthModule } from '../auth/auth.module.js'
import { CockpitModule } from '../cockpit/cockpit.module.js'
import { PrintoutModule } from '../printout/printout.module.js'
import { ConfirmationModule } from '../confirmation/confirmation.module.js'
import { OwlModeModule } from '../owl-mode/owl-mode.module.js'
import { ReceiptModule } from '../receipt/receipt.module.js'
import { UnlockModule } from '../unlock/unlock.module.js'
import { ProfileModule } from '../profile/profile.module.js'
import { MasterDataModule } from '../master-data/master-data.module.js'
import { AuditModule } from '../audit/audit.module.js'
import { McpController } from './mcp.controller.js'
import { McpRateLimiter } from './mcp-rate-limit.js'
import { McpReportService } from './mcp-report.service.js'
import { McpService } from './mcp.service.js'
import { InterviewModule } from '../interview/interview.module.js'
import { TaxEstimateModule } from '../tax-estimate/tax-estimate.module.js'
import { LinkModule } from '../link/link.module.js'
import { ChildrenModule } from '../children/children.module.js'
import { DeadlinesModule } from '../deadlines/deadlines.module.js'
import { RentalModule } from '../rental/rental.module.js'
import { AssistantTaskModule } from '../assistant-task/assistant-task.module.js'
import { BusinessModule } from '../business/business.module.js'

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    CockpitModule,
    PrintoutModule,
    ConfirmationModule,
    OwlModeModule,
    ReceiptModule,
    UnlockModule,
    ProfileModule,
    MasterDataModule,
    AuditModule,
    InterviewModule,
    TaxEstimateModule,
    LinkModule,
    ChildrenModule,
    DeadlinesModule,
    RentalModule,
    AssistantTaskModule,
    BusinessModule,
  ],
  controllers: [McpController],
  providers: [McpService, McpReportService, { provide: McpRateLimiter, useFactory: () => new McpRateLimiter() }],
  exports: [McpService],
})
export class McpModule {}
