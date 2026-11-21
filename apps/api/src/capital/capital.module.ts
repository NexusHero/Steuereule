import { Module } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { MarkingModule } from '../marking/marking.module.js'
import { AuditModule } from '../audit/audit.module.js'
import { InterviewModule } from '../interview/interview.module.js'
import { LstbModule } from '../lstb/lstb.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { TAX_YEAR_REPOSITORY } from '../cockpit/tax-year.repository.js'
import { PrismaTaxYearRepository } from '../cockpit/tax-year.repository.prisma.js'
import { CapitalController } from './capital.controller.js'
import { CAPITAL_REPOSITORY } from './capital.repository.js'
import { PrismaCapitalRepository } from './capital.repository.prisma.js'
import { CapitalService, HOUSEHOLD_ESTIMATE, type HouseholdEstimate } from './capital.service.js'
import { TaxEstimateService } from '../tax-estimate/tax-estimate.service.js'

@Module({
  imports: [MarkingModule, PrismaModule, AuditModule, InterviewModule, LstbModule],
  controllers: [CapitalController],
  providers: [
    CapitalService,
    { provide: CAPITAL_REPOSITORY, useClass: PrismaCapitalRepository },
    { provide: TAX_YEAR_REPOSITORY, useClass: PrismaTaxYearRepository },
    {
      // TaxEstimateModule imports this module (for the capital records), so the estimate is looked up when asked for.
      provide: HOUSEHOLD_ESTIMATE,
      inject: [ModuleRef],
      useFactory: (moduleRef: ModuleRef): HouseholdEstimate => ({
        getState: (userId, taxYear) => moduleRef.get(TaxEstimateService, { strict: false }).getState(userId, taxYear),
      }),
    },
  ],
  exports: [CAPITAL_REPOSITORY],
})
export class CapitalModule {}
