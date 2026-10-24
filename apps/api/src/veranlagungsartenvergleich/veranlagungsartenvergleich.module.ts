import { Module } from '@nestjs/common'
import { InterviewModule } from '../interview/interview.module.js'
import { LstbModule } from '../lstb/lstb.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { TAX_YEAR_REPOSITORY } from '../cockpit/tax-year.repository.js'
import { PrismaTaxYearRepository } from '../cockpit/tax-year.repository.prisma.js'
import { VeranlagungsartenvergleichController } from './veranlagungsartenvergleich.controller.js'
import { VeranlagungsartenvergleichService } from './veranlagungsartenvergleich.service.js'

@Module({
  imports: [PrismaModule, LstbModule, InterviewModule],
  controllers: [VeranlagungsartenvergleichController],
  providers: [
    VeranlagungsartenvergleichService,
    // The same TaxYearRepository seam the Cockpit uses — provided here (not imported from
    // CockpitModule) because CockpitModule does not export it; one Prisma read path either way.
    { provide: TAX_YEAR_REPOSITORY, useClass: PrismaTaxYearRepository },
  ],
})
export class VeranlagungsartenvergleichModule {}
