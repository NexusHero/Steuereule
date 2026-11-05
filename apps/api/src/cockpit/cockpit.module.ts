import { Module } from '@nestjs/common'
import { ChLohnausweisModule } from '../ch-lohnausweis/ch-lohnausweis.module.js'
import { InterviewModule } from '../interview/interview.module.js'
import { KapitalModule } from '../kapital/kapital.module.js'
import { LstbModule } from '../lstb/lstb.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { RenteModule } from '../rente/rente.module.js'
import { KennzeichnungModule } from '../kennzeichnung/kennzeichnung.module.js'
import { VermietungModule } from '../vermietung/vermietung.module.js'
import { CockpitController } from './cockpit.controller.js'
import { CockpitService } from './cockpit.service.js'
import { PrismaTaxYearRepository } from './tax-year.repository.prisma.js'
import { TAX_YEAR_REPOSITORY } from './tax-year.repository.js'

@Module({
  imports: [PrismaModule, LstbModule, InterviewModule, KennzeichnungModule, RenteModule, KapitalModule, VermietungModule, ChLohnausweisModule],
  controllers: [CockpitController],
  providers: [
    CockpitService,
    { provide: TAX_YEAR_REPOSITORY, useClass: PrismaTaxYearRepository },
  ],
})
export class CockpitModule {}
