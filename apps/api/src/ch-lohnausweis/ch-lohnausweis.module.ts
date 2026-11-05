import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { InterviewModule } from '../interview/interview.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { ChLohnausweisController } from './ch-lohnausweis.controller.js'
import { CROSS_BORDER_SALARY_STATEMENT_REPOSITORY } from './ch-lohnausweis.repository.js'
import { PrismaChLohnausweisRepository } from './ch-lohnausweis.repository.prisma.js'
import { ChLohnausweisService } from './ch-lohnausweis.service.js'

@Module({
  imports: [PrismaModule, AuditModule, InterviewModule],
  controllers: [ChLohnausweisController],
  providers: [ChLohnausweisService, { provide: CROSS_BORDER_SALARY_STATEMENT_REPOSITORY, useClass: PrismaChLohnausweisRepository }],
  exports: [CROSS_BORDER_SALARY_STATEMENT_REPOSITORY],
})
export class ChLohnausweisModule {}
