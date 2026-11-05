import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { CAPITAL_REPOSITORY, type CapitalRepository } from '../kapital/kapital.repository.js'
import { KapitalModule } from '../kapital/kapital.module.js'
import { KennzeichnungModule } from '../kennzeichnung/kennzeichnung.module.js'
import { LSTB_REPOSITORY, type LstbRepository } from '../lstb/lstb.repository.js'
import { LstbModule } from '../lstb/lstb.module.js'
import { PENSION_REPOSITORY, type PensionRepository } from '../rente/rente.repository.js'
import { RenteModule } from '../rente/rente.module.js'
import { RENTAL_REPOSITORY, type RentalRepository } from '../vermietung/vermietung.repository.js'
import { VermietungModule } from '../vermietung/vermietung.module.js'
import { BestaetigungController } from './bestaetigung.controller.js'
import { ConfirmationService } from './bestaetigung.service.js'
import { FELD_ZUGRIFF, feldZugriffAus } from './feld-zugriff.js'

@Module({
  imports: [AuditModule, KennzeichnungModule, LstbModule, RenteModule, KapitalModule, VermietungModule],
  controllers: [BestaetigungController],
  providers: [
    ConfirmationService,
    {
      provide: FELD_ZUGRIFF,
      inject: [LSTB_REPOSITORY, PENSION_REPOSITORY, CAPITAL_REPOSITORY, RENTAL_REPOSITORY],
      useFactory: (lstb: LstbRepository, rente: PensionRepository, kapital: CapitalRepository, vermietung: RentalRepository) =>
        feldZugriffAus({ lstb, rente, kapital, vermietung }),
    },
  ],
  exports: [ConfirmationService],
})
export class BestaetigungModule {}
