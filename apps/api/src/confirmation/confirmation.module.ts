import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { CAPITAL_REPOSITORY, type CapitalRepository } from '../capital/capital.repository.js'
import { CapitalModule } from '../capital/capital.module.js'
import { MarkingModule } from '../marking/marking.module.js'
import { WAGE_TAX_CERTIFICATE_REPOSITORY, type WageTaxCertificateRepository } from '../lstb/lstb.repository.js'
import { LstbModule } from '../lstb/lstb.module.js'
import { PENSION_REPOSITORY, type PensionRepository } from '../pension/pension.repository.js'
import { PensionModule } from '../pension/pension.module.js'
import { RENTAL_REPOSITORY, type RentalRepository } from '../rental/rental.repository.js'
import { RentalModule } from '../rental/rental.module.js'
import { ConfirmationController } from './confirmation.controller.js'
import { ConfirmationService } from './confirmation.service.js'
import { FIELD_ACCESS, fieldAccessFrom } from './field-access.js'

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
