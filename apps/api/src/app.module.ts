import { Module } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { ThrottlerModule } from '@nestjs/throttler'
import { AccountModule } from './account/account.module.js'
import { AssistantsModule } from './assistenten/assistenten.module.js'
import { PrintoutModule } from './printout/printout.module.js'
import { AuthModule } from './auth/auth.module.js'
import { ReceiptModule } from './receipt/receipt.module.js'
import { LstbScanModule } from './lstb-scan/lstb-scan.module.js'
import { ChCertificateScanModule } from './ch-certificate-scan/ch-certificate-scan.module.js'
import { AssessmentScanModule } from './assessment-scan/assessment-scan.module.js'
import { YearHistoryModule } from './year-history/year-history.module.js'
import { SubmissionModule } from './submission/submission.module.js'
import { AssessmentModule } from './assessment/assessment.module.js'
import { UnlockModule } from './unlock/unlock.module.js'
import { DeadlinesModule } from './deadlines/deadlines.module.js'
import { TakeoverModule } from './takeover/takeover.module.js'
import { ConfirmationModule } from './confirmation/confirmation.module.js'
import { ChSalaryCertificateModule } from './ch-salary-certificate/ch-salary-certificate.module.js'
import { CockpitModule } from './cockpit/cockpit.module.js'
import { AddressModule } from './address/address.module.js'
import { DeviceModule } from './device/device.module.js'
import { HealthModule } from './health/health.module.js'
import { CapabilitiesModule } from './capabilities/capabilities.module.js'
import { InterviewModule } from './interview/interview.module.js'
import { CapitalModule } from './capital/capital.module.js'
import { CommuteModule } from './commute/commute.module.js'
import { TaxEstimateModule } from './tax-estimate/tax-estimate.module.js'
import { TaxEstimatePortsModule } from './tax-estimate/tax-estimate-ports.module.js'
import { LstbModule } from './lstb/lstb.module.js'
import { ProfileModule } from './profile/profile.module.js'
import { PensionModule } from './pension/pension.module.js'
import { MasterDataModule } from './master-data/master-data.module.js'
import { FilingTypeComparisonModule } from './filing-type-comparison/filing-type-comparison.module.js'
import { RentalModule } from './rental/rental.module.js'
import { BusinessModule } from './business/business.module.js'
import { BusinessReceiptModule } from './business/business-receipt.module.js'
import { ChildrenModule } from './children/children.module.js'
import { LinkModule } from './link/link.module.js'
import { HouseholdModule } from './household/household.module.js'
import { OwlModeModule } from './owl-mode/owl-mode.module.js'
import { AdvisorModule } from './advisor/advisor.module.js'
import { McpModule } from './mcp/mcp.module.js'
import { BETTER_AUTH_BUNDLE, type BetterAuthBundle } from './auth/auth.tokens.js'
import { SharedThrottlerStorage } from './rate-limit/shared-throttler-storage.js'
import { DomainErrorFilter } from './common/domain-error.filter.js'

@Module({
  imports: [
    // The counters live on the shared rate-limit storage, so a limit holds across Cloud Run instances (ADR-0109).
    ThrottlerModule.forRootAsync({
      inject: [BETTER_AUTH_BUNDLE],
      useFactory: (bundle: BetterAuthBundle) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 10 }],
        storage: new SharedThrottlerStorage(bundle.rateLimitStorage),
      }),
    }),
    AuthModule,
    ProfileModule,
    CockpitModule,
    InterviewModule,
    LstbModule,
    ChSalaryCertificateModule,
    PensionModule,
    CapitalModule,
    CommuteModule,
    TaxEstimateModule,
    TaxEstimatePortsModule,
    ReceiptModule,
    LstbScanModule,
    ChCertificateScanModule,
    AssessmentScanModule,
    YearHistoryModule,
    SubmissionModule,
    AssessmentModule,
    AccountModule,
    AssistantsModule,
    AddressModule,
    DeviceModule,
    HealthModule,
    CapabilitiesModule,
    FilingTypeComparisonModule,
    RentalModule,
    BusinessModule,
    BusinessReceiptModule,
    DeadlinesModule,
    TakeoverModule,
    ConfirmationModule,
    UnlockModule,
    MasterDataModule,
    PrintoutModule,
    ChildrenModule,
    LinkModule,
    HouseholdModule,
    OwlModeModule,
    AdvisorModule,
    McpModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: DomainErrorFilter }],
})
export class AppModule {}
