import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { CAPITAL_REPOSITORY, type CapitalRepository } from '../kapital/kapital.repository.js'
import { CapitalModule } from '../kapital/kapital.module.js'
import { MarkingModule } from '../kennzeichnung/kennzeichnung.module.js'
import { WAGE_TAX_CERTIFICATE_REPOSITORY, type WageTaxCertificateRepository } from '../lstb/lstb.repository.js'
import { LstbModule } from '../lstb/lstb.module.js'
import { PENSION_REPOSITORY, type PensionRepository } from '../rente/rente.repository.js'
import { PensionModule } from '../rente/rente.module.js'
import { RENTAL_REPOSITORY, type RentalRepository } from '../vermietung/vermietung.repository.js'
import { RentalModule } from '../vermietung/vermietung.module.js'
import { ConfirmationController } from './bestaetigung.controller.js'
import { ConfirmationService } from './bestaetigung.service.js'
import { FIELD_ACCESS, fieldAccessFrom } from './feld-zugriff.js'

@Module({
  imports: [AuditModule, MarkingModule, LstbModule, PensionModule, CapitalModule, RentalModule],
  controllers: [ConfirmationController],
  providers: [
    ConfirmationService,
    {
      provide: FIELD_ACCESS,
      inject: [WAGE_TAX_CERTIFICATE_REPOSITORY, PENSION_REPOSITORY, CAPITAL_REPOSITORY, RENTAL_REPOSITORY],
      useFactory: (lstb: WageTaxCertificateRepository, pension: PensionRepository, capital: CapitalRepository, rental: RentalRepository) =>
        fieldAccessFrom({ lstb, pension, capital, rental }),
    },
  ],
  exports: [ConfirmationService],
})
export class ConfirmationModule {}
