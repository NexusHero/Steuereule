import { Module } from '@nestjs/common'
import { KennzeichnungModule } from '../kennzeichnung/kennzeichnung.module.js'
import { AuditModule } from '../audit/audit.module.js'
import { InterviewModule } from '../interview/interview.module.js'
import { LstbModule } from '../lstb/lstb.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { TAX_YEAR_REPOSITORY } from '../cockpit/tax-year.repository.js'
import { PrismaTaxYearRepository } from '../cockpit/tax-year.repository.prisma.js'
import { KapitalController } from './kapital.controller.js'
import { KAPITAL_REPOSITORY } from './kapital.repository.js'
import { PrismaKapitalRepository } from './kapital.repository.prisma.js'
import { KapitalService } from './kapital.service.js'

@Module({
  imports: [KennzeichnungModule, PrismaModule, AuditModule, InterviewModule, LstbModule],
  controllers: [KapitalController],
  providers: [
    KapitalService,
    { provide: KAPITAL_REPOSITORY, useClass: PrismaKapitalRepository },
    { provide: TAX_YEAR_REPOSITORY, useClass: PrismaTaxYearRepository },
  ],
  exports: [KAPITAL_REPOSITORY],
})
export class KapitalModule {}
