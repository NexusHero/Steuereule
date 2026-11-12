import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { ChSalaryCertificateModule } from '../ch-salary-certificate/ch-salary-certificate.module.js'
import { InterviewModule } from '../interview/interview.module.js'
import { LstbModule } from '../lstb/lstb.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { AssessmentController } from './assessment.controller.js'
import { ASSESSMENT_REPOSITORY } from './assessment.repository.js'
import { PrismaAssessmentRepository } from './assessment.repository.prisma.js'
import { AssessmentService } from './assessment.service.js'

@Module({
  imports: [PrismaModule, AuditModule, LstbModule, InterviewModule, ChSalaryCertificateModule],
  controllers: [AssessmentController],
  providers: [AssessmentService, { provide: ASSESSMENT_REPOSITORY, useClass: PrismaAssessmentRepository }],
  exports: [ASSESSMENT_REPOSITORY, AssessmentService],
})
export class AssessmentModule {}
