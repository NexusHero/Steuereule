import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { ChSalaryCertificateModule } from '../ch-lohnausweis/ch-lohnausweis.module.js'
import { InterviewModule } from '../interview/interview.module.js'
import { LstbModule } from '../lstb/lstb.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { AssessmentController } from './bescheid.controller.js'
import { ASSESSMENT_REPOSITORY } from './bescheid.repository.js'
import { PrismaAssessmentRepository } from './bescheid.repository.prisma.js'
import { AssessmentService } from './bescheid.service.js'

@Module({
  imports: [PrismaModule, AuditModule, LstbModule, InterviewModule, ChSalaryCertificateModule],
  controllers: [AssessmentController],
  providers: [AssessmentService, { provide: ASSESSMENT_REPOSITORY, useClass: PrismaAssessmentRepository }],
  exports: [ASSESSMENT_REPOSITORY],
})
export class AssessmentModule {}
