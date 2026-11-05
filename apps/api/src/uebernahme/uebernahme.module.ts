import { Module } from '@nestjs/common'
import { BestaetigungModule } from '../bestaetigung/bestaetigung.module.js'
import { KapitalModule } from '../kapital/kapital.module.js'
import { KennzeichnungModule } from '../kennzeichnung/kennzeichnung.module.js'
import { LstbModule } from '../lstb/lstb.module.js'
import { RenteModule } from '../rente/rente.module.js'
import { VermietungModule } from '../vermietung/vermietung.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { UebernahmeController } from './uebernahme.controller.js'
import { UebernahmeService } from './uebernahme.service.js'
import { TAX_YEAR_ROLLOVER_REPOSITORY } from './jahresuebernahme.repository.js'
import { PrismaJahresuebernahmeRepository } from './jahresuebernahme.repository.prisma.js'

@Module({
  imports: [PrismaModule, KennzeichnungModule, BestaetigungModule, LstbModule, RenteModule, KapitalModule, VermietungModule],
  controllers: [UebernahmeController],
  providers: [
    UebernahmeService,
    { provide: TAX_YEAR_ROLLOVER_REPOSITORY, useClass: PrismaJahresuebernahmeRepository },
  ],
  exports: [UebernahmeService, TAX_YEAR_ROLLOVER_REPOSITORY],
})
export class UebernahmeModule {}
