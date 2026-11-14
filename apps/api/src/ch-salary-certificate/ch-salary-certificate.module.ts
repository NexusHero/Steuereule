import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { InterviewModule } from '../interview/interview.module.js'
import { LinkModule } from '../link/link.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { ChSalaryCertificateController } from './ch-salary-certificate.controller.js'
import { CROSS_BORDER_SALARY_STATEMENT_REPOSITORY } from './ch-salary-certificate.repository.js'
import { PrismaChSalaryCertificateRepository } from './ch-salary-certificate.repository.prisma.js'
import { ChSalaryCertificateService } from './ch-salary-certificate.service.js'

@Module({
  imports: [PrismaModule, AuditModule, InterviewModule, LinkModule],
  controllers: [ChSalaryCertificateController],
  providers: [ChSalaryCertificateService, { provide: CROSS_BORDER_SALARY_STATEMENT_REPOSITORY, useClass: PrismaChSalaryCertificateRepository }],
  exports: [CROSS_BORDER_SALARY_STATEMENT_REPOSITORY],
})
export class ChSalaryCertificateModule {}
