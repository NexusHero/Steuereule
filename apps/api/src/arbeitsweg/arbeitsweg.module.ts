import { Module } from '@nestjs/common'
import { LinkModule } from '../kopplung/kopplung.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { CommuteController } from './arbeitsweg.controller.js'
import { COMMUTE_REPOSITORY } from './arbeitsweg.repository.js'
import { PrismaCommuteRepository } from './arbeitsweg.repository.prisma.js'
import { CommuteService } from './arbeitsweg.service.js'

@Module({
  imports: [PrismaModule, LinkModule],
  controllers: [CommuteController],
  providers: [CommuteService, { provide: COMMUTE_REPOSITORY, useClass: PrismaCommuteRepository }],
  exports: [COMMUTE_REPOSITORY],
})
export class CommuteModule {}
