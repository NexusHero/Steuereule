import { Module } from '@nestjs/common'
import { ConfirmationModule } from '../confirmation/confirmation.module.js'
import { CapitalModule } from '../capital/capital.module.js'
import { MarkingModule } from '../marking/marking.module.js'
import { LstbModule } from '../lstb/lstb.module.js'
import { PensionModule } from '../pension/pension.module.js'
import { RentalModule } from '../rental/rental.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { TakeoverController } from './takeover.controller.js'
import { TakeoverService } from './takeover.service.js'
import { TAX_YEAR_ROLLOVER_REPOSITORY } from './year-takeover.repository.js'
import { PrismaYearTakeoverRepository } from './year-takeover.repository.prisma.js'

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
