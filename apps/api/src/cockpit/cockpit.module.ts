import { Module } from '@nestjs/common'
import { InterviewModule } from '../interview/interview.module.js'
import { LstbModule } from '../lstb/lstb.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { UebernahmeModule } from '../uebernahme/uebernahme.module.js'
import { CockpitController } from './cockpit.controller.js'
import { CockpitService } from './cockpit.service.js'
import { PrismaTaxYearRepository } from './tax-year.repository.prisma.js'
import { TAX_YEAR_REPOSITORY } from './tax-year.repository.js'

@Module({
  imports: [PrismaModule, LstbModule, InterviewModule, UebernahmeModule],
  controllers: [CockpitController],
  providers: [
    CockpitService,
    { provide: TAX_YEAR_REPOSITORY, useClass: PrismaTaxYearRepository },
  ],
})
export class CockpitModule {}
