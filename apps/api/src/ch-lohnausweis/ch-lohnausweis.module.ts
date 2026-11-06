import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { InterviewModule } from '../interview/interview.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { ChSalaryCertificateController } from './ch-lohnausweis.controller.js'
import { CROSS_BORDER_SALARY_STATEMENT_REPOSITORY } from './ch-lohnausweis.repository.js'
import { PrismaChSalaryCertificateRepository } from './ch-lohnausweis.repository.prisma.js'
import { ChSalaryCertificateService } from './ch-lohnausweis.service.js'

@Module({
  imports: [PrismaModule, AuditModule, InterviewModule],
  controllers: [ChSalaryCertificateController],
  providers: [ChSalaryCertificateService, { provide: CROSS_BORDER_SALARY_STATEMENT_REPOSITORY, useClass: PrismaChSalaryCertificateRepository }],
  exports: [CROSS_BORDER_SALARY_STATEMENT_REPOSITORY],
})
export class ChSalaryCertificateModule {}
