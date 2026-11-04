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
import { JAHRESUEBERNAHME_REPOSITORY } from './jahresuebernahme.repository.js'
import { PrismaJahresuebernahmeRepository } from './jahresuebernahme.repository.prisma.js'

@Module({
  imports: [PrismaModule, KennzeichnungModule, BestaetigungModule, LstbModule, RenteModule, KapitalModule, VermietungModule],
  controllers: [UebernahmeController],
  providers: [
    UebernahmeService,
    { provide: JAHRESUEBERNAHME_REPOSITORY, useClass: PrismaJahresuebernahmeRepository },
  ],
  exports: [UebernahmeService, JAHRESUEBERNAHME_REPOSITORY],
})
export class UebernahmeModule {}
