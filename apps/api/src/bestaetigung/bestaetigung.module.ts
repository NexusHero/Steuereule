import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { KAPITAL_REPOSITORY, type KapitalRepository } from '../kapital/kapital.repository.js'
import { KapitalModule } from '../kapital/kapital.module.js'
import { KennzeichnungModule } from '../kennzeichnung/kennzeichnung.module.js'
import { LSTB_REPOSITORY, type LstbRepository } from '../lstb/lstb.repository.js'
import { LstbModule } from '../lstb/lstb.module.js'
import { RENTE_REPOSITORY, type RenteRepository } from '../rente/rente.repository.js'
import { RenteModule } from '../rente/rente.module.js'
import { VERMIETUNG_REPOSITORY, type VermietungRepository } from '../vermietung/vermietung.repository.js'
import { VermietungModule } from '../vermietung/vermietung.module.js'
import { BestaetigungController } from './bestaetigung.controller.js'
import { BestaetigungService } from './bestaetigung.service.js'
import { FELD_ZUGRIFF, feldZugriffAus } from './feld-zugriff.js'

@Module({
  imports: [AuditModule, KennzeichnungModule, LstbModule, RenteModule, KapitalModule, VermietungModule],
  controllers: [BestaetigungController],
  providers: [
    BestaetigungService,
    {
      provide: FELD_ZUGRIFF,
      inject: [LSTB_REPOSITORY, RENTE_REPOSITORY, KAPITAL_REPOSITORY, VERMIETUNG_REPOSITORY],
      useFactory: (lstb: LstbRepository, rente: RenteRepository, kapital: KapitalRepository, vermietung: VermietungRepository) =>
        feldZugriffAus({ lstb, rente, kapital, vermietung }),
    },
  ],
  exports: [BestaetigungService],
})
export class BestaetigungModule {}
