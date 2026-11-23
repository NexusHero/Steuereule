import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module.js'
import { MarkingModule } from '../marking/marking.module.js'
import { LinkModule } from '../link/link.module.js'
import { SubmissionModule } from '../submission/submission.module.js'
import { BusinessModule } from '../business/business.module.js'
import { CockpitController } from './cockpit.controller.js'
import { CockpitService } from './cockpit.service.js'
import { TaxCaseModule } from '../tax-case/tax-case.module.js'
import { TaxYearModule } from '../tax-year/tax-year.module.js'

@Module({
  imports: [PrismaModule, TaxCaseModule, MarkingModule, LinkModule, SubmissionModule, BusinessModule, TaxYearModule],
  controllers: [CockpitController],
  providers: [CockpitService],
  exports: [CockpitService],
})
export class CockpitModule {}
