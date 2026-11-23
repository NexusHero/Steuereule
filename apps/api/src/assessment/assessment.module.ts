import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { TaxCaseModule } from '../tax-case/tax-case.module.js'
import { AssessmentController } from './assessment.controller.js'
import { ASSESSMENT_REPOSITORY } from './assessment.repository.js'
import { PrismaAssessmentRepository } from './assessment.repository.prisma.js'
import { AssessmentService } from './assessment.service.js'
import { FILING_VERSION_REPOSITORY } from './filing-version.repository.js'
import { PrismaFilingVersionRepository } from './filing-version.repository.prisma.js'

@Module({
  imports: [PrismaModule, AuditModule, TaxCaseModule],
  controllers: [AssessmentController],
  providers: [
    AssessmentService,
    { provide: ASSESSMENT_REPOSITORY, useClass: PrismaAssessmentRepository },
    { provide: FILING_VERSION_REPOSITORY, useClass: PrismaFilingVersionRepository },
  ],
  exports: [ASSESSMENT_REPOSITORY, FILING_VERSION_REPOSITORY, AssessmentService],
})
export class AssessmentModule {}
