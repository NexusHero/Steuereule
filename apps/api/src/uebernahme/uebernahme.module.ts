import { Module } from '@nestjs/common'
import { KapitalModule } from '../kapital/kapital.module.js'
import { LstbModule } from '../lstb/lstb.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { RenteModule } from '../rente/rente.module.js'
import { VermietungModule } from '../vermietung/vermietung.module.js'
import { UebernahmeController } from './uebernahme.controller.js'
import { UEBERNAHME_REPOSITORY } from './uebernahme.repository.js'
import { PrismaUebernahmeRepository } from './uebernahme.repository.prisma.js'
import { UebernahmeService } from './uebernahme.service.js'

@Module({
  imports: [PrismaModule, LstbModule, RenteModule, KapitalModule, VermietungModule],
  controllers: [UebernahmeController],
  providers: [UebernahmeService, { provide: UEBERNAHME_REPOSITORY, useClass: PrismaUebernahmeRepository }],
  exports: [UEBERNAHME_REPOSITORY],
})
export class UebernahmeModule {}
