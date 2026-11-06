import { Module } from '@nestjs/common'
import { LinkModule } from '../link/link.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { CommuteController } from './commute.controller.js'
import { COMMUTE_REPOSITORY } from './commute.repository.js'
import { PrismaCommuteRepository } from './commute.repository.prisma.js'
import { CommuteService } from './commute.service.js'

@Module({
  imports: [PrismaModule, LinkModule],
  controllers: [CommuteController],
  providers: [CommuteService, { provide: COMMUTE_REPOSITORY, useClass: PrismaCommuteRepository }],
  exports: [COMMUTE_REPOSITORY],
})
export class CommuteModule {}
