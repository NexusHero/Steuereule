import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module.js'
import { CockpitController } from './cockpit.controller.js'
import { CockpitService } from './cockpit.service.js'
import { PrismaTaxYearRepository } from './tax-year.repository.prisma.js'
import { TAX_YEAR_REPOSITORY } from './tax-year.repository.js'

@Module({
  imports: [PrismaModule],
  controllers: [CockpitController],
  providers: [
    CockpitService,
    { provide: TAX_YEAR_REPOSITORY, useClass: PrismaTaxYearRepository },
  ],
})
export class CockpitModule {}
