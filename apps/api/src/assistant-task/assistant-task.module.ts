import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module.js'
import { ASSISTANT_TASK_REPOSITORY } from './assistant-task.repository.js'
import { PrismaAssistantTaskRepository } from './assistant-task.repository.prisma.js'
import { AssistantTaskService } from './assistant-task.service.js'

@Module({
  imports: [PrismaModule],
  providers: [AssistantTaskService, { provide: ASSISTANT_TASK_REPOSITORY, useClass: PrismaAssistantTaskRepository }],
  exports: [AssistantTaskService],
})
export class AssistantTaskModule {}
