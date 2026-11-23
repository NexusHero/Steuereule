import { Module } from '@nestjs/common'
import { AdvisorModule } from '../advisor/advisor.module.js'
import { AssessmentModule } from '../assessment/assessment.module.js'
import { AuditModule } from '../audit/audit.module.js'
import { CapitalModule } from '../capital/capital.module.js'
import { ChildrenModule } from '../children/children.module.js'
import { CommuteModule } from '../commute/commute.module.js'
import { PensionModule } from '../pension/pension.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { ReceiptStorageModule } from '../receipt/receipt-storage.module.js'
import { RentalModule } from '../rental/rental.module.js'
import { TaxCaseModule } from '../tax-case/tax-case.module.js'
import { TaxEstimateModule } from '../tax-estimate/tax-estimate.module.js'
import { FiledElsewhereController, YearHistoryController } from './year-history.controller.js'
import { YearHistoryInsightsService } from './year-history-insights.service.js'
import { YEAR_HISTORY_REPOSITORY } from './year-history.repository.js'
import { PrismaYearHistoryRepository } from './year-history.repository.prisma.js'
import { YearHistoryService } from './year-history.service.js'

/** Steuer-Verlauf (ADR-0098): reads through the modules that keep the facts; none of them depends on it. */
@Module({
  imports: [
    PrismaModule,
    AuditModule,
    AssessmentModule,
    TaxCaseModule,
    TaxEstimateModule,
    CommuteModule,
    ChildrenModule,
    CapitalModule,
    PensionModule,
    RentalModule,
    ReceiptStorageModule,
    AdvisorModule,
  ],
  controllers: [YearHistoryController, FiledElsewhereController],
  providers: [YearHistoryService, YearHistoryInsightsService, { provide: YEAR_HISTORY_REPOSITORY, useClass: PrismaYearHistoryRepository }],
})
export class YearHistoryModule {}
