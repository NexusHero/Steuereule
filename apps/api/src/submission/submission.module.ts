import { Module } from '@nestjs/common'
import { AssessmentModule } from '../assessment/assessment.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { TaxCaseModule } from '../tax-case/tax-case.module.js'
import { TaxEstimateModule } from '../tax-estimate/tax-estimate.module.js'
import { SubmissionController } from './submission.controller.js'
import { SUBMISSION_REPOSITORY } from './submission.repository.js'
import { PrismaSubmissionRepository } from './submission.repository.prisma.js'
import { SubmissionService } from './submission.service.js'

/** The Abgabe (ADR-0098 §8): writes the FilingVersion the Verlauf and the Bescheidprüfung read. */
@Module({
  imports: [PrismaModule, AssessmentModule, TaxCaseModule, TaxEstimateModule],
  controllers: [SubmissionController],
  providers: [SubmissionService, { provide: SUBMISSION_REPOSITORY, useClass: PrismaSubmissionRepository }],
  exports: [SubmissionService],
})
export class SubmissionModule {}
