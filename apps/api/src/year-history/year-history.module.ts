import { Module } from '@nestjs/common'
import { AssessmentModule } from '../assessment/assessment.module.js'
import { AuditModule } from '../audit/audit.module.js'
import { ChSalaryCertificateModule } from '../ch-salary-certificate/ch-salary-certificate.module.js'
import { CommuteModule } from '../commute/commute.module.js'
import { InterviewModule } from '../interview/interview.module.js'
import { LinkModule } from '../link/link.module.js'
import { LstbModule } from '../lstb/lstb.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { TaxEstimateModule } from '../tax-estimate/tax-estimate.module.js'
import { YearHistoryController } from './year-history.controller.js'
import { YEAR_HISTORY_REPOSITORY } from './year-history.repository.js'
import { PrismaYearHistoryRepository } from './year-history.repository.prisma.js'
import { YearHistoryService } from './year-history.service.js'

/** Steuer-Verlauf (ADR-0098): reads through the modules that keep the facts; none of them depends on it. */
@Module({
  imports: [PrismaModule, AuditModule, AssessmentModule, LstbModule, ChSalaryCertificateModule, CommuteModule, InterviewModule, LinkModule, TaxEstimateModule],
  controllers: [YearHistoryController],
  providers: [YearHistoryService, { provide: YEAR_HISTORY_REPOSITORY, useClass: PrismaYearHistoryRepository }],
})
export class YearHistoryModule {}
