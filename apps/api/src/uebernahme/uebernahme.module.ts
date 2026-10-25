import { Module } from '@nestjs/common'
import { LstbModule } from '../lstb/lstb.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { UebernahmeController } from './uebernahme.controller.js'
import { UEBERNAHME_REPOSITORY } from './uebernahme.repository.js'
import { PrismaUebernahmeRepository } from './uebernahme.repository.prisma.js'
import { UebernahmeService } from './uebernahme.service.js'

@Module({
  imports: [PrismaModule, LstbModule],
  controllers: [UebernahmeController],
  providers: [UebernahmeService, { provide: UEBERNAHME_REPOSITORY, useClass: PrismaUebernahmeRepository }],
  exports: [UEBERNAHME_REPOSITORY],
})
export class UebernahmeModule {}
