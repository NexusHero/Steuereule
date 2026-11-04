import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module.js'
import { AssistentenController } from './assistenten.controller.js'
import { ASSISTENTEN_REPOSITORY } from './assistenten.repository.js'
import { PrismaAssistentenRepository } from './assistenten.repository.prisma.js'
import { AssistentenService } from './assistenten.service.js'

@Module({
  imports: [PrismaModule],
  controllers: [AssistentenController],
  providers: [
    AssistentenService,
    {
      provide: ASSISTENTEN_REPOSITORY,
      useClass: PrismaAssistentenRepository,
    },
  ],
  exports: [AssistentenService, ASSISTENTEN_REPOSITORY],
})
export class AssistentenModule {}
