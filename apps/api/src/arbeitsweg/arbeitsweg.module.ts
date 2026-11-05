import { Module } from '@nestjs/common'
import { KopplungModule } from '../kopplung/kopplung.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { ArbeitswegController } from './arbeitsweg.controller.js'
import { COMMUTE_REPOSITORY } from './arbeitsweg.repository.js'
import { PrismaArbeitswegRepository } from './arbeitsweg.repository.prisma.js'
import { ArbeitswegService } from './arbeitsweg.service.js'

@Module({
  imports: [PrismaModule, KopplungModule],
  controllers: [ArbeitswegController],
  providers: [ArbeitswegService, { provide: COMMUTE_REPOSITORY, useClass: PrismaArbeitswegRepository }],
  exports: [COMMUTE_REPOSITORY],
})
export class ArbeitswegModule {}
