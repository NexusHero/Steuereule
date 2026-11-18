import { Module } from '@nestjs/common'
import { AssessmentModule } from '../assessment/assessment.module.js'
import { ChSalaryCertificateModule } from '../ch-salary-certificate/ch-salary-certificate.module.js'
import { CommuteModule } from '../commute/commute.module.js'
import { InterviewModule } from '../interview/interview.module.js'
import { LinkModule } from '../link/link.module.js'
import { LstbModule } from '../lstb/lstb.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { TaxEstimateModule } from '../tax-estimate/tax-estimate.module.js'
import { SubmissionController } from './submission.controller.js'
import { SUBMISSION_REPOSITORY } from './submission.repository.js'
import { PrismaSubmissionRepository } from './submission.repository.prisma.js'
import { SubmissionService } from './submission.service.js'

/** The Abgabe (ADR-0098 §8): writes the FilingVersion the Verlauf and the Bescheidprüfung read. */
@Module({
  imports: [PrismaModule, AssessmentModule, LstbModule, ChSalaryCertificateModule, CommuteModule, InterviewModule, LinkModule, TaxEstimateModule],
  controllers: [SubmissionController],
  providers: [SubmissionService, { provide: SUBMISSION_REPOSITORY, useClass: PrismaSubmissionRepository }],
  exports: [SubmissionService],
})
export class SubmissionModule {}
