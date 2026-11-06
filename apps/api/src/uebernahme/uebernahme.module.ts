import { Module } from '@nestjs/common'
import { ConfirmationModule } from '../bestaetigung/bestaetigung.module.js'
import { CapitalModule } from '../kapital/kapital.module.js'
import { MarkingModule } from '../kennzeichnung/kennzeichnung.module.js'
import { LstbModule } from '../lstb/lstb.module.js'
import { PensionModule } from '../rente/rente.module.js'
import { RentalModule } from '../vermietung/vermietung.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { TakeoverController } from './uebernahme.controller.js'
import { TakeoverService } from './uebernahme.service.js'
import { TAX_YEAR_ROLLOVER_REPOSITORY } from './jahresuebernahme.repository.js'
import { PrismaYearTakeoverRepository } from './jahresuebernahme.repository.prisma.js'

@Module({
  imports: [PrismaModule, MarkingModule, ConfirmationModule, LstbModule, PensionModule, CapitalModule, RentalModule],
  controllers: [TakeoverController],
  providers: [
    TakeoverService,
    { provide: TAX_YEAR_ROLLOVER_REPOSITORY, useClass: PrismaYearTakeoverRepository },
  ],
  exports: [TakeoverService, TAX_YEAR_ROLLOVER_REPOSITORY],
})
export class TakeoverModule {}
