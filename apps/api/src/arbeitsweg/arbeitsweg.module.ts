import { Module } from '@nestjs/common'
import { KopplungModule } from '../kopplung/kopplung.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { ArbeitswegController } from './arbeitsweg.controller.js'
import { ARBEITSWEG_REPOSITORY } from './arbeitsweg.repository.js'
import { PrismaArbeitswegRepository } from './arbeitsweg.repository.prisma.js'
import { ArbeitswegService } from './arbeitsweg.service.js'

@Module({
  imports: [PrismaModule, KopplungModule],
  controllers: [ArbeitswegController],
  providers: [ArbeitswegService, { provide: ARBEITSWEG_REPOSITORY, useClass: PrismaArbeitswegRepository }],
  exports: [ARBEITSWEG_REPOSITORY],
})
export class ArbeitswegModule {}
