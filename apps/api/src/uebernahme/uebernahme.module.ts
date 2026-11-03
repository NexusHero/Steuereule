import { Module } from '@nestjs/common'
import { BestaetigungModule } from '../bestaetigung/bestaetigung.module.js'
import { KapitalModule } from '../kapital/kapital.module.js'
import { KennzeichnungModule } from '../kennzeichnung/kennzeichnung.module.js'
import { LstbModule } from '../lstb/lstb.module.js'
import { RenteModule } from '../rente/rente.module.js'
import { VermietungModule } from '../vermietung/vermietung.module.js'
import { UebernahmeController } from './uebernahme.controller.js'
import { UebernahmeService } from './uebernahme.service.js'

@Module({
  imports: [KennzeichnungModule, BestaetigungModule, LstbModule, RenteModule, KapitalModule, VermietungModule],
  controllers: [UebernahmeController],
  providers: [UebernahmeService],
})
export class UebernahmeModule {}
