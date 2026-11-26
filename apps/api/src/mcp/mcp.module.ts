import { Module, type FactoryProvider, type InjectionToken, type Type } from '@nestjs/common'
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
import { BETTER_AUTH_BUNDLE } from '../auth/auth.tokens.js'
import type { BetterAuthBundle } from '../auth/better-auth.js'
import { MCP_LIMITS, McpRateLimiter } from './mcp-rate-limit.js'
import { McpReportService } from './mcp-report.service.js'
import { McpService } from './mcp.service.js'
import { MCP_DEPS, type McpDeps } from './mcp-session.js'
import { InterviewModule } from '../interview/interview.module.js'
import { TaxEstimateModule } from '../tax-estimate/tax-estimate.module.js'
import { LinkModule } from '../link/link.module.js'
import { ChildrenModule } from '../children/children.module.js'
import { DeadlinesModule } from '../deadlines/deadlines.module.js'
import { RentalModule } from '../rental/rental.module.js'
import { AssistantTaskModule } from '../assistant-task/assistant-task.module.js'
import { BusinessModule } from '../business/business.module.js'
import { AssessmentModule } from '../assessment/assessment.module.js'
import { AssistantTaskService } from '../assistant-task/assistant-task.service.js'
import { AuditService } from '../audit/audit.service.js'
import { BusinessService } from '../business/business.service.js'
import { ChildrenService } from '../children/children.service.js'
import { CockpitService } from '../cockpit/cockpit.service.js'
import { KEYED_LOCK } from '../common/keyed-lock.js'
import { TRANSACTION_RUNNER } from '../common/transaction-runner.js'
import { ConfirmationService } from '../confirmation/confirmation.service.js'
import { DeadlinesService } from '../deadlines/deadlines.service.js'
import { LinkService } from '../link/link.service.js'
import { MASTER_DATA_REPOSITORY } from '../master-data/master-data.repository.js'
import { OwlModeService } from '../owl-mode/owl-mode.service.js'
import { PrintoutService } from '../printout/printout.service.js'
import { PROFILE_REPOSITORY } from '../profile/profile.repository.js'
import { ReceiptService } from '../receipt/receipt.service.js'
import { UploadAdmission } from '../receipt/upload-admission.js'
import { RENTAL_REPOSITORY } from '../rental/rental.repository.js'
import { UnlockService } from '../unlock/unlock.service.js'
import { YEAR_HISTORY_REPOSITORY } from '../year-history/year-history.repository.js'
import { PrismaYearHistoryRepository } from '../year-history/year-history.repository.prisma.js'

/**
 * Where each collaborator of the tools comes from, by its name in `McpDeps`. A class token is checked against
 * the type of its field; a symbol token names a port whose adapter the providing module chooses. Every one is
 * provided by a module imported below, so none is optional.
 */
export const MCP_DEP_TOKENS: { readonly [K in keyof McpDeps]-?: Type<NonNullable<McpDeps[K]>> | symbol } = {
  cockpit: CockpitService,
  printout: PrintoutService,
  confirmation: ConfirmationService,
  owlMode: OwlModeService,
  receipts: ReceiptService,
  unlock: UnlockService,
  profiles: PROFILE_REPOSITORY,
  masterData: MASTER_DATA_REPOSITORY,
  audit: AuditService,
  locks: KEYED_LOCK,
  transactions: TRANSACTION_RUNNER,
  admission: UploadAdmission,
  report: McpReportService,
  link: LinkService,
  children: ChildrenService,
  deadlines: DeadlinesService,
  rentals: RENTAL_REPOSITORY,
  tasks: AssistantTaskService,
  business: BusinessService,
  years: YEAR_HISTORY_REPOSITORY,
}
const MCP_DEP_NAMES = Object.keys(MCP_DEP_TOKENS) as (keyof McpDeps)[]

/** `McpDeps` as one provider: each field is the instance behind the token of the same name above. */
export const mcpDepsProvider: FactoryProvider<McpDeps> = {
  provide: MCP_DEPS,
  inject: MCP_DEP_NAMES.map((name): InjectionToken => MCP_DEP_TOKENS[name]),
  useFactory: (...collaborators: unknown[]) => Object.fromEntries(MCP_DEP_NAMES.map((name, index) => [name, collaborators[index]])) as unknown as McpDeps,
}

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
    AssessmentModule,
  ],
  controllers: [McpController],
  providers: [
    McpService,
    McpReportService,
    mcpDepsProvider,
    // Only the year list of the account (steuerjahre_auflisten); the Verlauf module itself is not needed here.
    { provide: YEAR_HISTORY_REPOSITORY, useClass: PrismaYearHistoryRepository },
    // One limiter per process, counting in the storage all instances share (ADR-0052 amendment 9).
    { provide: McpRateLimiter, useFactory: (bundle: BetterAuthBundle) => new McpRateLimiter(Date.now, MCP_LIMITS, bundle.rateLimitStorage), inject: [BETTER_AUTH_BUNDLE] },
  ],
  exports: [McpService],
})
export class McpModule {}
