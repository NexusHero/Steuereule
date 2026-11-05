import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module.js'
import { AssistentenController } from './assistenten.controller.js'
import { ASSISTANT_REPOSITORY } from './assistenten.repository.js'
import { PrismaAssistentenRepository } from './assistenten.repository.prisma.js'
import { AssistentenService } from './assistenten.service.js'

@Module({
  imports: [PrismaModule],
  controllers: [AssistentenController],
  providers: [
    AssistentenService,
    {
      provide: ASSISTANT_REPOSITORY,
      useClass: PrismaAssistentenRepository,
    },
  ],
  exports: [AssistentenService, ASSISTANT_REPOSITORY],
})
export class AssistentenModule {}
