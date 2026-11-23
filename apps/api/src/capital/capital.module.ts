import { Module } from '@nestjs/common'
import { MarkingModule } from '../marking/marking.module.js'
import { AuditModule } from '../audit/audit.module.js'
import { InterviewModule } from '../interview/interview.module.js'
import { LstbModule } from '../lstb/lstb.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { TaxYearModule } from '../tax-year/tax-year.module.js'
import { CapitalController } from './capital.controller.js'
import { CAPITAL_REPOSITORY } from './capital.repository.js'
import { PrismaCapitalRepository } from './capital.repository.prisma.js'
import { CapitalService } from './capital.service.js'

/** CapitalService gets HOUSEHOLD_ESTIMATE from TaxEstimatePortsModule (global, bound once in AppModule). */
@Module({
  imports: [MarkingModule, PrismaModule, AuditModule, InterviewModule, LstbModule, TaxYearModule],
  controllers: [CapitalController],
  providers: [
    CapitalService,
    { provide: CAPITAL_REPOSITORY, useClass: PrismaCapitalRepository },
  ],
  exports: [CAPITAL_REPOSITORY],
})
export class CapitalModule {}
