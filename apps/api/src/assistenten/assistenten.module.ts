import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module.js'
import { AssistantsController } from './assistenten.controller.js'
import { ASSISTANT_REPOSITORY } from './assistenten.repository.js'
import { PrismaAssistantsRepository } from './assistenten.repository.prisma.js'
import { AssistantsService } from './assistenten.service.js'

@Module({
  imports: [PrismaModule],
  controllers: [AssistantsController],
  providers: [
    AssistantsService,
    {
      provide: ASSISTANT_REPOSITORY,
      useClass: PrismaAssistantsRepository,
    },
  ],
  exports: [AssistantsService, ASSISTANT_REPOSITORY],
})
export class AssistantsModule {}
