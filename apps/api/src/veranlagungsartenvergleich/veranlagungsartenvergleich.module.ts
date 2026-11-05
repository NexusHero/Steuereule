import { Module } from '@nestjs/common'
import { InterviewModule } from '../interview/interview.module.js'
import { LstbModule } from '../lstb/lstb.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { TAX_YEAR_REPOSITORY } from '../cockpit/tax-year.repository.js'
import { PrismaTaxYearRepository } from '../cockpit/tax-year.repository.prisma.js'
import { VeranlagungsartenvergleichController } from './veranlagungsartenvergleich.controller.js'
import { AssessmentComparisonService } from './veranlagungsartenvergleich.service.js'

@Module({
  imports: [PrismaModule, LstbModule, InterviewModule],
  controllers: [VeranlagungsartenvergleichController],
  providers: [
    AssessmentComparisonService,
    { provide: TAX_YEAR_REPOSITORY, useClass: PrismaTaxYearRepository },
  ],
})
export class VeranlagungsartenvergleichModule {}
